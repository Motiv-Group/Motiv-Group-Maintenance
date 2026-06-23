// MOTIV health engine v3 — dual SLA + blocker (spec §12)
// Supplier clock pauses while the ball is internal/store-side; the internal
// clock keeps running so internal delay is never hidden.
//
// The blocker/owner/pause are derived from the ticket STATUS (always set) when
// the explicit columns (sla_paused, current_blocker, blocker_started_at,
// internal_action_due_at) are absent. Explicit columns, once the workflow
// writes them, take precedence. Status groups mirror lib/workflow.ts.
import type { HealthTicket, SlaTargets, BlockerOwnerType } from './types'
import { isActive } from './types'
import { deriveDueDates } from './priority'

const MIN = 60_000

// ── Status groups (mirror lib/workflow.ts TicketStatus) ──
// Ball with the supplier to produce/resubmit a quote.
const QUOTE_SUPPLIER = new Set(['quote_requested', 'quote_revision'])
// Ball with internal (RM/exec) to decide a quote or variation. Supplier paused.
const QUOTE_APPROVAL = new Set(['quoted', 'awaiting_decision', 'variation_review'])
// Ball with internal to sign off / close out. Supplier paused.
const SIGNOFF_INTERNAL = new Set(['submitted_for_signoff', 'approved_closeout'])
// Pre-assignment triage: 'open' is owned by internal (validate), 'info_requested' by the store.
const INTAKE_INTERNAL = new Set(['open'])
const INTAKE_STORE = new Set(['info_requested'])

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / (24 * 60 * MIN)))
}
function addMins(iso: string, mins: number): string {
  return new Date(new Date(iso).getTime() + mins * MIN).toISOString()
}
function past(now: Date, due: string | null | undefined): boolean {
  return !!due && now.getTime() > new Date(due).getTime()
}

export type SupplierSlaStatus = 'not_started' | 'running' | 'paused' | 'breached' | 'completed_within' | 'completed_late' | 'closed'
export type InternalSlaStatus = 'not_running' | 'running' | 'breached' | 'met'

export interface SlaResult {
  supplierStatus: SupplierSlaStatus
  internalStatus: InternalSlaStatus
  currentBlocker: string | null            // quote_approval | store_access | completion_signoff | supplier_action | triage | null
  blockerOwnerType: BlockerOwnerType | null
  blockerStartedAt: string | null
  daysWithBlocker: number | null
  delayOwner: 'supplier' | 'internal' | 'store' | 'none'
  nextAction: string
  nextActionDueAt: string | null
  supplierBreached: boolean
  internalBreached: boolean
  atRisk: boolean                          // approaching resolution due (not breached)
}

export function computeTicketSla(t: HealthTicket, s: SlaTargets, now: Date = new Date()): SlaResult {
  const due = deriveDueDates(t, s)
  const base = (p: Partial<SlaResult> & Pick<SlaResult, 'supplierStatus' | 'internalStatus' | 'nextAction'>): SlaResult => ({
    currentBlocker: null, blockerOwnerType: null, blockerStartedAt: null, daysWithBlocker: null,
    delayOwner: 'none', nextActionDueAt: null, supplierBreached: false, internalBreached: false, atRisk: false, ...p,
  })

  // ── Terminal ──
  if (!isActive(t.status)) {
    if (t.status === 'completed') {
      const at = t.completed_at ?? t.updated_at
      const late = new Date(at).getTime() > new Date(due.resolutionDue).getTime()
      return base({ supplierStatus: late ? 'completed_late' : 'completed_within', internalStatus: 'met', nextAction: 'None — completed' })
    }
    return base({ supplierStatus: 'closed', internalStatus: 'met', nextAction: 'None — closed' })
  }

  const status = t.status
  const blockerStartedExplicit = t.blocker_started_at ?? null

  // ── Internal/store waits (supplier paused) ──
  const waitingStoreAccess = t.current_blocker === 'store_access' ||
    (t.store_confirmation_required === true && !t.store_confirmed_at && (status === 'acknowledged' || status === 'in_progress'))
  const decisionPending = t.quote_decision_required === true && (t.quote_decision_status ?? 'pending') === 'pending'
  const waitingDecision = QUOTE_APPROVAL.has(status) || decisionPending
  const waitingSignoff = SIGNOFF_INTERNAL.has(status) || t.current_blocker === 'completion_signoff'

  if (waitingStoreAccess) {
    const dueAt = t.internal_action_due_at ?? null
    const started = blockerStartedExplicit
    return base({
      supplierStatus: 'paused', internalStatus: 'running', currentBlocker: 'store_access',
      blockerOwnerType: t.blocker_owner_type ?? 'store', blockerStartedAt: started, daysWithBlocker: daysSince(started, now),
      delayOwner: 'store', nextAction: 'Confirm store access', nextActionDueAt: dueAt, internalBreached: past(now, dueAt),
    })
  }
  if (waitingDecision) {
    const started = blockerStartedExplicit ?? t.quote_submitted_at ?? null
    const dueAt = t.internal_action_due_at ?? due.internalDecisionDue ??
      (started ? addMins(started, s.internal_decision_mins) : null)
    return base({
      supplierStatus: 'paused', internalStatus: 'running', currentBlocker: 'quote_approval',
      blockerOwnerType: t.blocker_owner_type ?? 'regional_manager', blockerStartedAt: started, daysWithBlocker: daysSince(started, now),
      delayOwner: 'internal', nextAction: status === 'variation_review' ? 'Review & decide the variation' : 'Review & decide the quote',
      nextActionDueAt: dueAt, internalBreached: past(now, dueAt),
    })
  }
  if (waitingSignoff) {
    const started = blockerStartedExplicit ?? t.submitted_for_signoff_at ?? null
    const dueAt = t.internal_action_due_at ?? (started ? addMins(started, s.internal_decision_mins) : null)
    return base({
      supplierStatus: 'paused', internalStatus: 'running', currentBlocker: 'completion_signoff',
      blockerOwnerType: t.blocker_owner_type ?? 'regional_manager', blockerStartedAt: started, daysWithBlocker: daysSince(started, now),
      delayOwner: 'internal', nextAction: 'Confirm completion / sign off', nextActionDueAt: dueAt, internalBreached: past(now, dueAt),
    })
  }

  // ── Pre-assignment triage ──
  if (INTAKE_INTERNAL.has(status)) {
    // 'open' — internal must validate/assign. Counts as internal (not supplier) delay.
    const dueAt = due.firstResponseDue
    return base({
      supplierStatus: 'not_started', internalStatus: 'running', currentBlocker: 'triage',
      blockerOwnerType: 'regional_manager', blockerStartedAt: t.created_at, daysWithBlocker: daysSince(t.created_at, now),
      delayOwner: 'internal', nextAction: 'Validate & assign ticket', nextActionDueAt: dueAt, internalBreached: past(now, dueAt),
    })
  }
  if (INTAKE_STORE.has(status)) {
    // 'info_requested' — ball with the store; no supplier/internal breach.
    return base({
      supplierStatus: 'not_started', internalStatus: 'not_running', currentBlocker: 'store_info',
      blockerOwnerType: 'store', blockerStartedAt: blockerStartedExplicit, daysWithBlocker: daysSince(blockerStartedExplicit, now),
      delayOwner: 'store', nextAction: 'Store to provide more information', nextActionDueAt: null,
    })
  }

  // ── Ball with the supplier ──
  const effPaused = t.sla_paused === true
  if (QUOTE_SUPPLIER.has(status)) {
    const dueAt = due.quoteDue
    const breached = !effPaused && past(now, dueAt)
    return base({
      supplierStatus: effPaused ? 'paused' : breached ? 'breached' : 'running',
      internalStatus: 'not_running', currentBlocker: effPaused ? (t.current_blocker ?? null) : 'supplier_action',
      blockerOwnerType: 'supplier', blockerStartedAt: blockerStartedExplicit ?? t.quote_requested_at ?? null,
      daysWithBlocker: daysSince(blockerStartedExplicit ?? t.quote_requested_at ?? null, now),
      delayOwner: effPaused ? 'internal' : 'supplier', nextAction: 'Supplier to submit quote', nextActionDueAt: dueAt,
      supplierBreached: breached,
    })
  }

  // supplier execution: assigned / assessment / accepted / scheduled / in_progress /
  // evidence_requested / snag / snag_assigned / snag_resolved
  const fr  = !t.first_response_at && past(now, due.firstResponseDue)
  const att = !t.attended_at       && past(now, due.attendanceDue)
  const res = past(now, due.resolutionDue)
  const supplierBreached = !effPaused && (fr || att || res)

  let supplierStatus: SupplierSlaStatus
  if (effPaused) supplierStatus = 'paused'
  else if (supplierBreached) supplierStatus = 'breached'
  else if (!t.first_response_at) supplierStatus = 'not_started'
  else supplierStatus = 'running'

  let nextAction = 'Supplier to complete work', nextActionDueAt: string | null = due.resolutionDue
  if (status === 'evidence_requested') { nextAction = 'Supplier to provide more evidence' }
  else if (!t.first_response_at) { nextAction = 'Supplier to acknowledge'; nextActionDueAt = due.firstResponseDue }
  else if (!t.attended_at)  { nextAction = 'Supplier to attend site'; nextActionDueAt = due.attendanceDue }

  // at-risk = ≥80% of resolution window elapsed and not breached
  const created = new Date(t.created_at).getTime()
  const span = new Date(due.resolutionDue).getTime() - created
  const atRisk = !supplierBreached && span > 0 && (now.getTime() - created) / span >= 0.8

  return base({
    supplierStatus, internalStatus: 'not_running',
    currentBlocker: effPaused ? (t.current_blocker ?? null) : 'supplier_action',
    blockerOwnerType: 'supplier', blockerStartedAt: blockerStartedExplicit, daysWithBlocker: daysSince(blockerStartedExplicit, now),
    delayOwner: effPaused ? 'internal' : 'supplier', nextAction, nextActionDueAt, supplierBreached, atRisk,
  })
}

export function supplierBreachOlderThan(t: HealthTicket, s: SlaTargets, days: number, now = new Date()): boolean {
  const r = computeTicketSla(t, s, now)
  if (!r.supplierBreached) return false
  const due = deriveDueDates(t, s)
  return now.getTime() - new Date(due.resolutionDue).getTime() > days * 24 * 60 * MIN
}
export function internalBreachOlderThan(t: HealthTicket, s: SlaTargets, days: number, now = new Date()): boolean {
  const r = computeTicketSla(t, s, now)
  if (!r.internalBreached || !r.nextActionDueAt) return false
  return now.getTime() - new Date(r.nextActionDueAt).getTime() > days * 24 * 60 * MIN
}
