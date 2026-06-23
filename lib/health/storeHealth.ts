// MOTIV health engine v3 — Store Health (spec §7 exact bands, §8 status, §9 overrides)
import type { HealthTicket, HealthStatus, SlaRuleResolver, OperationalImpact } from './types'
import { isActive } from './types'
import {
  STORE_WEIGHTS, OP_IMPACT_DEDUCTION, THRESHOLDS, statusForScore, STATUS_RANK, bandCeiling,
} from './constants'
import { computeTicketSla } from './sla'
import { deriveDueDates } from './priority'

const DAY = 24 * 3600_000

export interface StoreHealthBreakdown {
  operationalRisk: number; sla: number; ticketLoad: number
  repeatDefect: number; commercialBlocker: number; dataQuality: number
}
export interface StoreHealthResult {
  storeId: string
  regionId: string | null
  breakdown: StoreHealthBreakdown
  calculatedHealthScore: number
  calculatedStatus: HealthStatus
  overrideApplied: boolean
  overrideReason: string | null
  finalHealthScore: number
  finalStatus: HealthStatus
  openTickets: number
  overdueTickets: number
  mainIssue: string
  // convenience
  criticalOverdue: boolean
  safetyOpen: number
  pendingDecisions: number
  costExposure: number
  repeatGroups: number
  supplierBreaches: number
  internalBreaches: number
}

export interface StoreInput { id: string; region_id?: string | null }

export function calculateStoreHealth(
  store: StoreInput, tickets: HealthTicket[], rules: SlaRuleResolver, now: Date = new Date(),
): StoreHealthResult {
  const active = tickets.filter(t => isActive(t.status))
  const slaOf = (t: HealthTicket) => computeTicketSla(t, rules(t.priority), now)
  const enriched = active.map(t => ({ t, sla: slaOf(t) }))

  // ── §7.1 Operational Risk (30) — highest single deduction ──
  let maxDeduction = 0, safetyOpen = 0
  for (const t of active) {
    let impact: OperationalImpact = t.operational_impact ?? 'none'
    if (t.safety_risk_flag) impact = 'safety_risk'
    else if (t.trading_impact_flag && OP_IMPACT_DEDUCTION[impact] < OP_IMPACT_DEDUCTION.trading_affected) impact = 'trading_affected'
    else if (t.customer_visible_flag && OP_IMPACT_DEDUCTION[impact] < OP_IMPACT_DEDUCTION.customer_visible) impact = 'customer_visible'
    else if (t.staff_impact_flag && OP_IMPACT_DEDUCTION[impact] < OP_IMPACT_DEDUCTION.staff_inconvenience) impact = 'staff_inconvenience'
    if (t.safety_risk_flag || impact === 'safety_risk') safetyOpen++
    maxDeduction = Math.max(maxDeduction, OP_IMPACT_DEDUCTION[impact])
  }
  const operationalRisk = clamp(STORE_WEIGHTS.operationalRisk - maxDeduction, 0, 30)

  // ── §7.2 SLA (20) — worst condition wins ──
  let atRisk = 0, overdue = 0, criticalOverdue = false, supplierBreaches = 0, internalBreaches = 0
  for (const { t, sla } of enriched) {
    if (sla.supplierBreached) supplierBreaches++
    if (sla.internalBreached) internalBreaches++
    const isOverdue = sla.supplierBreached || sla.internalBreached
    if (isOverdue) { overdue++; if (t.priority === 'P1') criticalOverdue = true }
    else if (sla.atRisk) atRisk++
  }
  const sla =
    criticalOverdue ? 0 :
    overdue >= 2 ? 5 :
    overdue === 1 ? 10 :
    atRisk >= 2 ? 12 :
    atRisk === 1 ? 16 : 20

  // ── §7.3 Ticket Load (15) ──
  const open = active.length
  const ticketLoad = open === 0 ? 15 : open <= 2 ? 12 : open <= 5 ? 8 : open <= 10 ? 4 : 0

  // ── §7.4 Repeat Defect (15) ──
  const { groups, criticalRepeat } = repeatGroupsFor(tickets, now)
  const repeatDefect = criticalRepeat ? 0 : groups === 0 ? 15 : groups === 1 ? 10 : groups === 2 ? 6 : 2

  // ── §7.5 Commercial Blocker (10) — worst applicable ──
  // The ">7d blocked → 0" band applies only to genuine commercial/internal
  // blockers (quote approval, sign-off, store access) — not normal supplier
  // execution (that's the SLA component) nor un-triaged intake.
  let commercialBlocker = 10, pendingDecisions = 0, costExposure = 0
  for (const { t, sla } of enriched) {
    costExposure += t.quote_value ?? 0
    const decisionPending = t.quote_decision_required && (t.quote_decision_status ?? 'pending') === 'pending'
    if (decisionPending) pendingDecisions++
    const quoteDue = deriveDueDates(t, rules(t.priority)).quoteDue
    const quoteOverdue = !t.quote_submitted_at && !!quoteDue && now.getTime() > new Date(quoteDue).getTime()
    const longBlock = (sla.currentBlocker === 'quote_approval' || sla.currentBlocker === 'completion_signoff' || sla.currentBlocker === 'store_access')
      && (sla.daysWithBlocker ?? 0) > THRESHOLDS.blockerMaxDays
    let band = 10
    if (longBlock) band = 0
    else if (decisionPending && (t.quote_value ?? 0) >= THRESHOLDS.highValueQuote) band = 3
    else if (quoteOverdue) band = 5
    else if (decisionPending) band = 5
    else if (t.quote_requested_at && !t.quote_submitted_at) band = 8
    commercialBlocker = Math.min(commercialBlocker, band)
  }

  // ── §7.6 Data Quality (10) — worst applicable ──
  // Only judge OWNED tickets (a supplier assigned, or past intake). Un-triaged
  // tickets aren't a data-quality problem — their delay is the SLA/triage clock.
  let missingUpdate = 0, staleOver7d = false, missingEvidence = false
  for (const t of active) {
    const owned = !!t.supplier_id || !(t.status === 'open' || t.status === 'info_requested')
    if (!owned) continue
    const last = mostRecent(t.last_supplier_update_at, t.last_internal_update_at, t.last_store_update_at, t.updated_at)
    if (last && now.getTime() - new Date(last).getTime() > THRESHOLDS.staleUpdateDays * DAY) staleOver7d = true
    const ageDays = (now.getTime() - new Date(t.created_at).getTime()) / DAY
    if (ageDays > 2 && !t.last_supplier_update_at && !t.last_internal_update_at) missingUpdate++
    const evidenceExpected = t.evidence_required || t.status === 'submitted_for_signoff' || t.status === 'approved_closeout'
    if (evidenceExpected && !(t.before_photo_uploaded || t.after_photo_uploaded || t.completion_certificate_uploaded)) missingEvidence = true
  }
  const dataQuality =
    staleOver7d ? 0 :
    missingEvidence ? 3 :
    missingUpdate >= 2 ? 4 :
    missingUpdate === 1 ? 7 : 10

  const breakdown: StoreHealthBreakdown = { operationalRisk, sla, ticketLoad, repeatDefect, commercialBlocker, dataQuality }
  const calculatedHealthScore = clamp(round(operationalRisk + sla + ticketLoad + repeatDefect + commercialBlocker + dataQuality), 0, 100)
  const calculatedStatus = statusForScore(calculatedHealthScore)

  // ── §9 overrides (escalate only) ──
  const ov = resolveOverride(enriched, groups, now)
  const overrideApplied = !!ov.status && STATUS_RANK[ov.status] > STATUS_RANK[calculatedStatus]
  const finalStatus = overrideApplied ? ov.status! : calculatedStatus
  const finalHealthScore = overrideApplied ? Math.min(calculatedHealthScore, bandCeiling(finalStatus)) : calculatedHealthScore
  const overdueTickets = overdue

  return {
    storeId: store.id, regionId: store.region_id ?? null, breakdown,
    calculatedHealthScore, calculatedStatus,
    overrideApplied, overrideReason: overrideApplied ? ov.reason : null,
    finalHealthScore, finalStatus,
    openTickets: open, overdueTickets, criticalOverdue, safetyOpen, pendingDecisions, costExposure, repeatGroups: groups, supplierBreaches, internalBreaches,
    mainIssue: deriveMainIssue({ open, overdue, safetyOpen, pendingDecisions, groups, override: overrideApplied ? ov.reason : null, breakdown }),
  }
}

// ── helpers ──
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)) }
function round(n: number) { return Math.round(n) }
function mostRecent(...xs: (string | null | undefined)[]): string | null {
  const t = xs.filter(Boolean).map(x => new Date(x as string).getTime())
  return t.length ? new Date(Math.max(...t)).toISOString() : null
}

function repeatGroupsFor(tickets: HealthTicket[], now: Date) {
  const since = now.getTime() - THRESHOLDS.repeatWindowDays * DAY
  const byCat = new Map<string, HealthTicket[]>()
  for (const t of tickets) {
    if (new Date(t.created_at).getTime() < since) continue
    const cat = (t.category ?? '').trim().toLowerCase()
    if (!cat) continue
    const arr = byCat.get(cat) ?? []; arr.push(t); byCat.set(cat, arr)
  }
  let groups = 0, criticalRepeat = false
  for (const arr of byCat.values()) {
    if (arr.length >= 2) { groups++; if (arr.some(t => t.priority === 'P1' || t.severity === 'critical')) criticalRepeat = true }
  }
  return { groups, criticalRepeat }
}

function resolveOverride(
  enriched: { t: HealthTicket; sla: ReturnType<typeof computeTicketSla> }[], groups: number, now: Date,
): { status: HealthStatus | null; reason: string | null } {
  for (const { t, sla } of enriched) {
    if (t.operational_impact === 'cannot_trade') return { status: 'critical', reason: 'Store cannot trade' }
    if (t.safety_risk_flag || t.operational_impact === 'safety_risk') return { status: 'critical', reason: 'Unresolved safety risk' }
    if (t.priority === 'P1' && (sla.supplierBreached || sla.internalBreached)) return { status: 'critical', reason: 'Critical ticket overdue' }
    if ((t.trading_impact_flag || t.operational_impact === 'trading_affected') && (sla.supplierBreached || sla.internalBreached))
      return { status: 'at_risk', reason: 'Trading-impact issue overdue' }
    if ((t.priority === 'P1' || t.trading_impact_flag) && sla.currentBlocker === 'quote_approval' && sla.internalBreached)
      return { status: 'critical', reason: 'Approval blocker on critical/trading issue exceeds internal SLA' }
  }
  if (groups > 3) return { status: 'at_risk', reason: `${groups} repeat defects in ${THRESHOLDS.repeatWindowDays} days` }
  for (const { t } of enriched) {
    if (t.priority === 'P1') {
      const last = mostRecent(t.last_supplier_update_at, t.last_internal_update_at, t.updated_at)
      if (last && now.getTime() - new Date(last).getTime() > THRESHOLDS.criticalStaleHours * 3600_000)
        return { status: 'at_risk', reason: `No update on a critical ticket for over ${THRESHOLDS.criticalStaleHours}h` }
    }
    if (t.priority === 'P1' && (t.status === 'submitted_for_signoff' || t.status === 'approved_closeout') && !t.completion_certificate_uploaded)
      return { status: 'attention', reason: 'Completion evidence missing on a critical job' }
  }
  return { status: null, reason: null }
}

function deriveMainIssue(x: {
  open: number; overdue: number; safetyOpen: number; pendingDecisions: number; groups: number
  override: string | null; breakdown: StoreHealthBreakdown
}): string {
  if (x.override) return x.override
  if (x.open === 0) return 'No active issues — store controlled'
  if (x.safetyOpen > 0) return `${x.safetyOpen} open safety-risk ticket(s)`
  if (x.overdue > 0) return `${x.overdue} overdue ticket(s)`
  if (x.pendingDecisions > 0) return `${x.pendingDecisions} decision(s) pending`
  if (x.groups > 0) return `${x.groups} repeat-defect pattern(s)`
  return `${x.open} open ticket(s)`
}
