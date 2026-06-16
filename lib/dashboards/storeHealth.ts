// ============================================================
// Dashboards v2 — calculateStoreHealth (spec §3, §12.2)
//
// Store Health (0-100) = weighted business-risk score, NOT a completion %.
//   Operational Risk 30 · SLA 20 · Ticket Load 15 · Repeat Defect 15 ·
//   Commercial Blocker 10 · Data Quality 10
// Then override rules can force a worse RAG band (e.g. unresolved safety risk
// → Critical) so a high average can never hide a dangerous store.
// ============================================================
import type { Ticket, SlaRule, RagStatus } from '@/lib/types'
import { STORE_WEIGHTS, THRESHOLDS, ragForScore, RAG_RANK } from './constants'
import { calculateTicketHealth } from './ticketHealth'
import type { SlaResult } from './sla'

const TERMINAL = new Set(['completed', 'cancelled', 'declined'])
const DAY = 24 * 3600_000

export interface StoreHealthBreakdown {
  operationalRisk: number
  sla: number
  ticketLoad: number
  repeatDefect: number
  commercialBlocker: number
  dataQuality: number
}

export interface StoreHealthResult {
  storeId: string
  regionId: string | null
  breakdown: StoreHealthBreakdown
  calculatedHealthScore: number
  calculatedRag: RagStatus
  overrideApplied: boolean
  overrideReason: string | null
  finalHealthScore: number
  finalRag: RagStatus
  openTickets: number
  overdueTickets: number
  mainIssue: string
  // convenience for dashboards
  criticalOpen: number
  safetyOpen: number
  tradingOpen: number
  repeatCount: number
  pendingApprovals: number
  costExposure: number
}

export interface StoreInput {
  id: string
  region_id?: string | null
}

/** rule resolver: returns the SlaRule for a ticket's priority (region or global). */
export type RuleResolver = (priority: Ticket['priority']) => SlaRule

export function calculateStoreHealth(
  store: StoreInput,
  tickets: Ticket[],
  ruleFor: RuleResolver,
  now: Date = new Date(),
): StoreHealthResult {
  const enriched = tickets.map(t => ({ t, h: calculateTicketHealth(t, ruleFor(t.priority), now) }))
  const active = enriched.filter(e => !TERMINAL.has(e.t.status))

  // ── 1. Operational Risk (/30) ──
  let opPenalty = 0
  let criticalOpen = 0, safetyOpen = 0, tradingOpen = 0
  for (const { t, h } of active) {
    const overdue = h.sla.supplierBreached || h.sla.internalBreached
    if (t.severity === 'critical') { criticalOpen++; opPenalty += overdue ? 8 : 5 }
    if (t.safety_risk_flag) { safetyOpen++; opPenalty += 8 }
    if (t.trading_impact_flag) { tradingOpen++; opPenalty += overdue ? 6 : 4 }
    if ((t.priority === 'urgent') && overdue) opPenalty += 4
  }
  const operationalRisk = clamp(STORE_WEIGHTS.operationalRisk - opPenalty, 0, STORE_WEIGHTS.operationalRisk)

  // ── 2. SLA Score (/20) ──
  const slaRelevant = enriched.filter(e => e.t.status !== 'cancelled')
  let met = 0, breached = 0
  for (const { t, h } of slaRelevant) {
    const isBreach =
      h.sla.supplierBreached || h.sla.internalBreached || h.sla.supplierStatus === 'completed_late'
    if (isBreach) breached++; else met++
  }
  const slaRate = (met + breached) > 0 ? met / (met + breached) : 1
  const sla = round(STORE_WEIGHTS.sla * slaRate)

  // ── 3. Ticket Load (/15) ──
  const openCount = active.length
  const ageing = active.filter(e => now.getTime() - new Date(e.t.created_at).getTime() > THRESHOLDS.loadAgeingDays * DAY).length
  let ticketLoad = STORE_WEIGHTS.ticketLoad * (1 - Math.min(1, openCount / THRESHOLDS.loadOpenTicketsMax))
  ticketLoad -= Math.min(5, ageing)
  ticketLoad = clamp(round(ticketLoad), 0, STORE_WEIGHTS.ticketLoad)

  // ── 4. Repeat Defect (/15) ── (same category recurring within window)
  const repeatCount = countRepeatGroups(tickets, now)
  const repeatDefect = clamp(STORE_WEIGHTS.repeatDefect - repeatCount * 5, 0, STORE_WEIGHTS.repeatDefect)

  // ── 5. Commercial Blocker (/10) ──
  const approvalBlocked = active.filter(e => e.h.sla.currentBlocker === 'quote_approval')
  const pendingApprovals = approvalBlocked.length
  const oldestApprovalDays = approvalBlocked.reduce((mx, e) => Math.max(mx, e.h.sla.daysWithBlocker ?? 0), 0)
  let commercialBlocker = STORE_WEIGHTS.commercialBlocker - pendingApprovals * 2.5
  if (oldestApprovalDays > 3) commercialBlocker -= 2
  commercialBlocker = clamp(round(commercialBlocker), 0, STORE_WEIGHTS.commercialBlocker)
  const costExposure = active.reduce((s, e) => s + (e.t.quote_value ?? 0), 0)

  // ── 6. Data Quality (/10) ──
  const dataQuality = dataQualityScore(store, active.map(e => e.t))

  const breakdown: StoreHealthBreakdown = {
    operationalRisk, sla, ticketLoad, repeatDefect, commercialBlocker, dataQuality,
  }
  const calculatedHealthScore = clamp(round(
    operationalRisk + sla + ticketLoad + repeatDefect + commercialBlocker + dataQuality,
  ), 0, 100)
  const calculatedRag = ragForScore(calculatedHealthScore) ?? 'critical'

  // ── Override rules (spec §3) — escalate RAG, never improve it ──
  const { rag: overrideRag, reason: overrideReason } = resolveOverride(active, repeatCount, now)
  const overrideApplied = !!overrideRag && RAG_RANK[overrideRag] > RAG_RANK[calculatedRag]
  const finalRag = overrideApplied ? overrideRag! : calculatedRag
  // Keep the number consistent with the (possibly worse) band.
  const finalHealthScore = overrideApplied ? Math.min(calculatedHealthScore, bandCeiling(finalRag)) : calculatedHealthScore

  const overdueTickets = active.filter(e => e.h.sla.supplierBreached || e.h.sla.internalBreached).length

  return {
    storeId: store.id,
    regionId: store.region_id ?? null,
    breakdown,
    calculatedHealthScore,
    calculatedRag,
    overrideApplied,
    overrideReason: overrideApplied ? overrideReason : null,
    finalHealthScore,
    finalRag,
    openTickets: openCount,
    overdueTickets,
    mainIssue: deriveMainIssue({ overrideReason: overrideApplied ? overrideReason : null, breakdown, criticalOpen, safetyOpen, tradingOpen, overdueTickets, pendingApprovals, repeatCount }),
    criticalOpen, safetyOpen, tradingOpen, repeatCount, pendingApprovals, costExposure,
  }
}

// ── helpers ──────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)) }
function round(n: number) { return Math.round(n * 10) / 10 }
function bandCeiling(rag: RagStatus) { return rag === 'critical' ? 49 : rag === 'red' ? 69 : rag === 'amber' ? 84 : 100 }

/** Number of repeat-defect groups (same category ≥2 times) within the window. */
function countRepeatGroups(tickets: Ticket[], now: Date): number {
  const since = now.getTime() - THRESHOLDS.repeatWindowDays * DAY
  const byCat = new Map<string, number>()
  for (const t of tickets) {
    if (new Date(t.created_at).getTime() < since) continue
    const cat = (t.category ?? '').trim().toLowerCase()
    if (!cat) continue
    byCat.set(cat, (byCat.get(cat) ?? 0) + 1)
  }
  let groups = 0
  for (const count of byCat.values()) if (count >= 2) groups++
  return groups
}

function dataQualityScore(store: StoreInput, activeTickets: Ticket[]): number {
  if (activeTickets.length === 0) {
    // Empty store: only the store-level field matters.
    return store.region_id ? STORE_WEIGHTS.dataQuality : STORE_WEIGHTS.dataQuality - 2
  }
  let present = 0, checks = 0
  for (const t of activeTickets) {
    checks += 3
    if (t.category) present++
    if (t.supplier_id) present++
    if (t.severity) present++
  }
  const completeness = checks > 0 ? present / checks : 1
  let score = STORE_WEIGHTS.dataQuality * completeness
  if (!store.region_id) score -= 2
  return clamp(round(score), 0, STORE_WEIGHTS.dataQuality)
}

function resolveOverride(
  active: { t: Ticket; h: { sla: SlaResult } }[],
  repeatCount: number,
  now: Date,
): { rag: RagStatus | null; reason: string | null } {
  const stale48 = (t: Ticket) => {
    const ref = t.last_supplier_update_at ?? t.last_internal_update_at ?? t.updated_at
    return now.getTime() - new Date(ref).getTime() > THRESHOLDS.criticalStaleHours * 3600_000
  }

  // Critical-band overrides
  for (const { t, h } of active) {
    if (t.safety_risk_flag) return { rag: 'critical', reason: 'Unresolved safety risk on an open ticket' }
    if (t.trading_impact_flag && t.severity === 'critical') return { rag: 'critical', reason: 'Store cannot trade — critical trading-impact issue open' }
    if (t.severity === 'critical' && (h.sla.supplierBreached || h.sla.internalBreached)) return { rag: 'critical', reason: 'Critical issue is overdue / breached' }
    if (h.sla.currentBlocker === 'quote_approval' && (t.severity === 'critical' || t.trading_impact_flag) && h.sla.internalBreached) {
      return { rag: 'critical', reason: 'Approval blocker on a critical/trading issue exceeds internal SLA' }
    }
  }

  // Red-band overrides
  if (repeatCount > THRESHOLDS.repeatStoreRedCount) return { rag: 'red', reason: `${repeatCount} repeat defects in the last ${THRESHOLDS.repeatWindowDays} days` }
  for (const { t, h } of active) {
    if (t.severity === 'critical' && stale48(t)) return { rag: 'red', reason: `No update on a critical ticket for over ${THRESHOLDS.criticalStaleHours}h` }
    if (t.trading_impact_flag && (h.sla.supplierBreached || h.sla.internalBreached)) return { rag: 'red', reason: 'Trading-impact issue is overdue' }
  }

  return { rag: null, reason: null }
}

function deriveMainIssue(x: {
  overrideReason: string | null
  breakdown: StoreHealthBreakdown
  criticalOpen: number
  safetyOpen: number
  tradingOpen: number
  overdueTickets: number
  pendingApprovals: number
  repeatCount: number
}): string {
  if (x.overrideReason) return x.overrideReason
  if (x.safetyOpen > 0) return `${x.safetyOpen} open safety-risk ticket(s)`
  if (x.overdueTickets > 0) return `${x.overdueTickets} overdue ticket(s)`
  if (x.pendingApprovals > 0) return `${x.pendingApprovals} quote(s) awaiting approval`
  if (x.repeatCount > 0) return `${x.repeatCount} repeat-defect pattern(s)`
  if (x.criticalOpen > 0) return `${x.criticalOpen} critical ticket(s) open`
  // fall back to weakest sub-score
  const entries = Object.entries(x.breakdown) as [keyof StoreHealthBreakdown, number][]
  const weakest = entries.sort((a, b) => (a[1] / weightOf(a[0])) - (b[1] / weightOf(b[0])))[0]
  const labels: Record<keyof StoreHealthBreakdown, string> = {
    operationalRisk: 'Operational risk', sla: 'SLA performance', ticketLoad: 'Open ticket load',
    repeatDefect: 'Repeat defects', commercialBlocker: 'Commercial blockers', dataQuality: 'Data quality',
  }
  return weakest ? `${labels[weakest[0]]} is the weakest area` : 'On track'
}

function weightOf(k: keyof StoreHealthBreakdown): number {
  const map: Record<keyof StoreHealthBreakdown, number> = {
    operationalRisk: STORE_WEIGHTS.operationalRisk, sla: STORE_WEIGHTS.sla, ticketLoad: STORE_WEIGHTS.ticketLoad,
    repeatDefect: STORE_WEIGHTS.repeatDefect, commercialBlocker: STORE_WEIGHTS.commercialBlocker, dataQuality: STORE_WEIGHTS.dataQuality,
  }
  return map[k]
}
