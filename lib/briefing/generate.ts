// AI Morning Briefing — server-only generation + daily cache.
// Hobby-friendly: no cron. The briefing is generated lazily on the first
// dashboard load of the day (one Groq call) and cached in daily_briefings for
// the rest of the day. Every failure path falls back to a deterministic
// briefing so the dashboard never blocks or breaks.
import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fallbackBriefing, type Briefing, type BriefingFacts, type BriefingRole, type BriefingScope } from './facts'

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const TIMEOUT_MS = 8_000

const ROLE_LABEL: Record<BriefingRole, string> = {
  store_manager: 'store manager', regional_manager: 'regional manager',
  supplier: 'maintenance supplier (contractor)', executive: 'executive (estate-wide)',
}

const SYSTEM_PROMPT = `You are an operations analyst for Motiv, a maintenance-ticketing platform in South Africa.
Write a short, punchy MORNING BRIEFING for the given role, using ONLY the JSON facts provided.
Rules:
- Plain South African business English. Currency is ZAR, written like R12 500.
- Lead with what matters most (safety, overdue work, money at risk, falling health), then end with ONE clear recommended next step.
- Never invent or estimate numbers — use only the facts given. If a fact is 0 or absent, don't mention it.
- No markdown, no bullet points, no emojis, no greeting padding beyond a brief "Good morning".
- "body" must be 2 to 4 sentences. "headline" must be at most 6 words.
Return strict JSON: {"headline": string, "body": string}.`

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
          { role: 'user', content: `Role: ${ROLE_LABEL[role]}\nFacts: ${JSON.stringify(facts)}` },
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

interface Args {
  companyId: string
  scope: BriefingScope
  scopeId: string
  role: BriefingRole
  facts: BriefingFacts
  now?: Date
}

/**
 * Return today's briefing for a scope, generating + caching it on first call of
 * the day. Never throws — degrades to a deterministic fallback.
 */
export async function getDailyBriefing({ companyId, scope, scopeId, role, facts, now = new Date() }: Args): Promise<Briefing> {
  const date = now.toISOString().slice(0, 10)
  const id = scopeId || companyId
  try {
    const db = createAdminClient()
    const { data: existing, error: selErr } = await db.from('daily_briefings')
      .select('headline, body, source')
      .eq('company_id', companyId).eq('scope', scope).eq('scope_id', id).eq('briefing_date', date)
      .maybeSingle()
    // Table not migrated yet (or transient read error) → show fallback without
    // hammering the LLM on every load. Caching resumes once the table exists.
    if (selErr) return fallbackBriefing(role, facts, now)
    if (existing) return { headline: existing.headline ?? null, body: existing.body, source: (existing.source as Briefing['source']) ?? 'ai' }

    const ai = await callGroq(role, facts)
    const briefing: Briefing = ai ? { headline: ai.headline || null, body: ai.body, source: 'ai' } : fallbackBriefing(role, facts, now)

    // Cache for the rest of the day; ignore conflicts from a concurrent first load.
    await db.from('daily_briefings').upsert({
      company_id: companyId, scope, scope_id: id, briefing_date: date, role,
      headline: briefing.headline, body: briefing.body, source: briefing.source, facts: facts as any,
    }, { onConflict: 'company_id,scope,scope_id,briefing_date', ignoreDuplicates: true })

    return briefing
  } catch {
    return fallbackBriefing(role, facts, now) // DB unavailable → still show something
  }
}
