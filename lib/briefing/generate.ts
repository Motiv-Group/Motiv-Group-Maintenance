// AI Morning Briefing — server-only generation + daily cache.
// Hobby-friendly: no cron. The briefing is generated lazily on the first
// dashboard load of the day (one Groq call) and cached in daily_briefings for
// the rest of the day. Every failure path falls back to a deterministic
// briefing so the dashboard never blocks or breaks.
import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'
import {
  assembleStoreManagerDashboard, assembleRegionalDashboard, assembleSupplierDashboard, assembleEstateDashboard,
} from '@/lib/health/data'
import {
  fallbackBriefing, storeFacts, regionFacts, supplierFacts, estateFacts,
  type Briefing, type BriefingFacts, type BriefingRole, type BriefingScope,
} from './facts'

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const TIMEOUT_MS = 8_000

const ROLE_LABEL: Record<BriefingRole, string> = {
  store_manager: 'store manager', regional_manager: 'regional manager',
  supplier: 'maintenance supplier (contractor)', executive: 'executive (estate-wide)',
}

const SYSTEM_PROMPT = `You are a senior operations analyst writing the morning briefing for Motiv, a maintenance-ticketing platform in South Africa.

Write a concise, professional briefing for the stated role using ONLY the facts provided. The facts are already formatted with their correct units — copy each value exactly, unit included.

Style:
- Polished South African business English. Calm, factual and decision-useful — no hype, no filler, no padding.
- Open with the single most important thing (safety, overdue or at-risk work, money at risk, or falling health), give brief supporting context, then close with ONE clear recommended next step.
- Keep every number EXACTLY as given, with its unit: percentages keep the % sign (write "62% health", never a bare "62"), money stays in Rand (e.g. R12 500). Never strip or change a unit.
- Do not invent, estimate or recalculate anything. If a fact is zero or absent, leave it out entirely.
- The recommended next step must match what the role can actually do. A store manager cannot assign, action or fix tickets themselves: when work is overdue or at risk, never say it is being handled or that "the team is following up" — tell them to follow up with, or escalate to, their Regional Manager for an update on what is being done.
- Plain sentences only — no markdown, lists, headings or emojis.
- "body": 2 to 4 sentences. "headline": at most 6 words, specific to today (not a generic title).

Return strict JSON: {"headline": string, "body": string}.`

/** Human-readable label from a camelCase fact key. */
function labelOf(k: string): string {
  return k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim()
}

/**
 * Render the raw facts into a clean, unit-bearing line list so the model never
 * has to guess units (the source of the "14" vs "14%" bug). Percentages get a
 * %, money gets R, the rest stay as plain counts.
 */
function factsToPrompt(facts: BriefingFacts): string {
  const money = /value|exposure/i
  const percent = /score$|rate$|^health$|health$/i
  const lines: string[] = []
  for (const [k, v] of Object.entries(facts)) {
    if (v == null || v === '') continue
    if (Array.isArray(v)) {
      if (!v.length) continue
      const items = v.map((o: unknown) => {
        if (o && typeof o === 'object') {
          // Facts arrays are built by the facts.ts builders as {name, health, issue} rows.
          const s = o as { name?: unknown; health?: unknown; issue?: unknown }
          const name = s.name ?? ''
          const health = s.health != null ? ` (${Math.round(Number(s.health))}% health)` : ''
          const issue = s.issue ? ` — ${s.issue}` : ''
          return `${name}${health}${issue}`.trim()
        }
        return String(o)
      })
      lines.push(`${labelOf(k)}: ${items.join('; ')}`)
    } else if (typeof v === 'number') {
      if (money.test(k)) lines.push(`${labelOf(k)}: R${Math.round(v).toLocaleString('en-ZA')}`)
      else if (percent.test(k)) lines.push(`${labelOf(k)}: ${Math.round(v)}%`)
      else lines.push(`${labelOf(k)}: ${v}`)
    } else {
      // Humanize snake_case enum values (status/band: 'at_risk' → 'at risk') so
      // the model never echoes raw internals into user-facing copy.
      lines.push(`${labelOf(k)}: ${typeof v === 'string' ? v.replace(/_/g, ' ') : v}`)
    }
  }
  return lines.join('\n')
}

async function callGroq(role: BriefingRole, facts: BriefingFacts): Promise<{ headline: string; body: string } | null> {
  if (!GROQ_API_KEY) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 320,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Role: ${ROLE_LABEL[role]}\n\nFacts (use exactly, units included):\n${factsToPrompt(facts)}` },
        ],
      }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = json.choices?.[0]?.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as { headline?: unknown; body?: unknown }
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : ''
    if (!body) return null
    const headline = typeof parsed.headline === 'string' ? parsed.headline.trim() : ''
    return { headline: headline.slice(0, 60), body }
  } catch {
    return null // timeout / network / parse error → caller uses fallback
  } finally {
    clearTimeout(timer)
  }
}

// facts may be passed eagerly (dashboards already assembled their data) or as a
// thunk that's only invoked on a cache MISS (lets the morning push skip the
// expensive dashboard assemble for every already-cached scope).
type FactsInput = BriefingFacts | (() => BriefingFacts | Promise<BriefingFacts>)

interface Args {
  companyId: string
  scope: BriefingScope
  scopeId: string
  role: BriefingRole
  facts: FactsInput
  now?: Date
}

/**
 * Return today's briefing for a scope, generating + caching it on first call of
 * the day. Never throws — degrades to a deterministic fallback.
 */
export async function getDailyBriefing({ companyId, scope, scopeId, role, facts, now = new Date() }: Args): Promise<Briefing> {
  const date = now.toISOString().slice(0, 10)
  const id = scopeId || companyId
  const resolveFacts = async (): Promise<BriefingFacts> => (typeof facts === 'function' ? await facts() : facts)
  try {
    const db = createAdminClient()
    const { data: existing, error: selErr } = await db.from('daily_briefings')
      .select('headline, body, source')
      .eq('company_id', companyId).eq('scope', scope).eq('scope_id', id).eq('briefing_date', date)
      .maybeSingle()
    // Cache hit → return without resolving facts (skips the dashboard assemble).
    if (existing) return { headline: existing.headline ?? null, body: existing.body, source: (existing.source as Briefing['source']) ?? 'ai' }

    const resolved = await resolveFacts()
    // Table not migrated yet (or transient read error) → fallback, don't cache.
    if (selErr) return fallbackBriefing(role, resolved, now)

    const ai = await callGroq(role, resolved)
    const briefing: Briefing = ai ? { headline: ai.headline || null, body: ai.body, source: 'ai' } : fallbackBriefing(role, resolved, now)

    // Cache for the rest of the day; ignore conflicts from a concurrent first load.
    await db.from('daily_briefings').upsert({
      company_id: companyId, scope, scope_id: id, briefing_date: date, role,
      // BriefingFacts is Record<string, unknown> holding only JSON-safe values.
      headline: briefing.headline, body: briefing.body, source: briefing.source, facts: resolved as Json,
    }, { onConflict: 'company_id,scope,scope_id,briefing_date', ignoreDuplicates: true })

    return briefing
  } catch {
    try { return fallbackBriefing(role, await resolveFacts(), now) } // DB unavailable → still show something
    catch { return { headline: null, body: 'Your briefing is unavailable right now.', source: 'fallback' } }
  }
}

/**
 * Resolve + build a user's briefing from their role/scope (shares the same daily
 * cache as the dashboards). Used by the WhatsApp menu. Returns null if the user
 * isn't linked to any scope yet.
 */
export async function getBriefingForUser(opts: { userId: string; role: string; companyId: string; now?: Date }): Promise<Briefing | null> {
  const { userId, role, companyId, now } = opts
  const db = createAdminClient()

  // facts are passed as thunks so the (expensive) dashboard assemble only runs
  // on a cache miss — important for the morning push that loops over every user.
  if (role === 'store_manager' || role === 'client') {
    const { data } = await db.from('store_users').select('store_id').eq('user_id', userId)
    const storeIds = (data ?? []).map(l => l.store_id)
    if (!storeIds.length) return null
    return getDailyBriefing({ companyId, scope: 'store', scopeId: storeIds.slice().sort().join(','), role: 'store_manager', facts: async () => storeFacts(await assembleStoreManagerDashboard(companyId, storeIds)), now })
  }
  if (role === 'regional_manager') {
    const { data } = await db.from('regional_users').select('region_id').eq('user_id', userId)
    const regionIds = (data ?? []).map(l => l.region_id)
    if (!regionIds.length) return null
    return getDailyBriefing({ companyId, scope: 'region', scopeId: regionIds.slice().sort().join(','), role: 'regional_manager', facts: async () => regionFacts(await assembleRegionalDashboard(companyId, regionIds)), now })
  }
  if (role === 'supplier') {
    const { data } = await db.from('supplier_users').select('supplier_id').eq('user_id', userId)
    const supplierIds = (data ?? []).map(l => l.supplier_id)
    if (!supplierIds.length) return null
    return getDailyBriefing({ companyId, scope: 'supplier', scopeId: supplierIds.slice().sort().join(','), role: 'supplier', facts: async () => supplierFacts(await assembleSupplierDashboard(companyId, supplierIds)), now })
  }
  if (role === 'executive' || role === 'system_admin') {
    return getDailyBriefing({ companyId, scope: 'estate', scopeId: companyId, role: 'executive', facts: async () => estateFacts(await assembleEstateDashboard(companyId)), now })
  }
  return null
}
