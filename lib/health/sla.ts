// MOTIV health engine v3 — dual SLA + blocker (spec §12)
// Supplier clock pauses while internal/store-side; internal clock keeps running.
import type { HealthTicket, SlaTargets, BlockerOwnerType } from './types'
import { isActive } from './types'
import { deriveDueDates } from './priority'

const MIN = 60_000

export type SupplierSlaStatus = 'not_started' | 'running' | 'paused' | 'breached' | 'completed_within' | 'completed_late' | 'closed'
export type InternalSlaStatus = 'not_running' | 'running' | 'breached' | 'met'

export interface SlaResult {
  supplierStatus: SupplierSlaStatus
  internalStatus: InternalSlaStatus
  currentBlocker: string | null            // quote_approval | store_access | completion_signoff | supplier_action | null
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

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / (24 * 60 * MIN)))
}

export function computeTicketSla(t: HealthTicket, s: SlaTargets, now: Date = new Date()): SlaResult {
  const due = deriveDueDates(t, s)
  const base = (p: Partial<SlaResult> & Pick<SlaResult, 'supplierStatus' | 'internalStatus' | 'nextAction'>): SlaResult => ({
    currentBlocker: null, blockerOwnerType: null, blockerStartedAt: null, daysWithBlocker: null,
    delayOwner: 'none', nextActionDueAt: null, supplierBreached: false, internalBreached: false, atRisk: false, ...p,
  })

  if (!isActive(t.status)) {
    if (t.status === 'completed') {
      const at = t.completed_at ?? t.updated_at
      const late = new Date(at).getTime() > new Date(due.resolutionDue).getTime()
      return base({ supplierStatus: late ? 'completed_late' : 'completed_within', internalStatus: 'met', nextAction: 'None — completed' })
    }
    return base({ supplierStatus: 'closed', internalStatus: 'met', nextAction: 'None — closed' })
  }

  // Determine blocker / who owns next action
  const waitingDecision = t.status === 'quoted' || t.status === 'awaiting_decision' ||
    (t.quote_decision_required === true && (t.quote_decision_status ?? 'pending') === 'pending')
  const waitingStoreAccess = t.current_blocker === 'store_access' ||
    (t.store_confirmation_required === true && !t.store_confirmed_at && (t.status === 'acknowledged' || t.status === 'in_progress'))
  const waitingSignoff = t.status === 'submitted_for_signoff' || t.current_blocker === 'completion_signoff'

  const blockerStartedAt = t.blocker_started_at ?? null
  const daysWithBlocker = daysSince(blockerStartedAt, now)

  if (waitingDecision) {
    const dueAt = due.internalDecisionDue
    const breached = !!dueAt && now.getTime() > new Date(dueAt).getTime()
    return base({
      supplierStatus: 'paused', internalStatus: 'running', currentBlocker: 'quote_approval',
      blockerOwnerType: t.blocker_owner_type ?? 'regional_manager', blockerStartedAt, daysWithBlocker,
      delayOwner: 'internal', nextAction: 'Review & decide the quote', nextActionDueAt: dueAt, internalBreached: breached,
    })
  }
  if (waitingSignoff) {
    const dueAt = t.internal_action_due_at ?? null
    const breached = !!dueAt && now.getTime() > new Date(dueAt).getTime()
    return base({
      supplierStatus: 'paused', internalStatus: 'running', currentBlocker: 'completion_signoff',
      blockerOwnerType: t.blocker_owner_type ?? 'regional_manager', blockerStartedAt, daysWithBlocker,
      delayOwner: 'internal', nextAction: 'Confirm completion / sign off', nextActionDueAt: dueAt, internalBreached: breached,
    })
  }
  if (waitingStoreAccess) {
    const dueAt = t.internal_action_due_at ?? null
    const breached = !!dueAt && now.getTime() > new Date(dueAt).getTime()
    return base({
      supplierStatus: 'paused', internalStatus: 'running', currentBlocker: 'store_access',
      blockerOwnerType: t.blocker_owner_type ?? 'store', blockerStartedAt, daysWithBlocker,
      delayOwner: 'store', nextAction: 'Confirm store access', nextActionDueAt: dueAt, internalBreached: breached,
    })
  }

  // Ball with supplier
  const fr  = !t.first_response_at && now.getTime() > new Date(due.firstResponseDue).getTime()
  const att = !t.attended_at       && now.getTime() > new Date(due.attendanceDue).getTime()
  const res = now.getTime() > new Date(due.resolutionDue).getTime()
  const supplierBreached = !t.sla_paused && (fr || att || res)

  let supplierStatus: SupplierSlaStatus
  if (t.sla_paused) supplierStatus = 'paused'
  else if (supplierBreached) supplierStatus = 'breached'
  else if (!t.first_response_at) supplierStatus = 'not_started'
  else supplierStatus = 'running'

  let nextAction = 'Supplier to complete work', nextActionDueAt: string | null = due.resolutionDue
  if (!t.first_response_at) { nextAction = 'Supplier to acknowledge'; nextActionDueAt = due.firstResponseDue }
  else if (!t.attended_at)  { nextAction = 'Supplier to attend site'; nextActionDueAt = due.attendanceDue }

  // at-risk = ≥80% of resolution window elapsed and not breached
  const created = new Date(t.created_at).getTime()
  const span = new Date(due.resolutionDue).getTime() - created
  const atRisk = !supplierBreached && span > 0 && (now.getTime() - created) / span >= 0.8

  return base({
    supplierStatus, internalStatus: 'not_running', currentBlocker: t.sla_paused ? (t.current_blocker ?? null) : 'supplier_action',
    blockerOwnerType: 'supplier', blockerStartedAt, daysWithBlocker, delayOwner: t.sla_paused ? 'internal' : 'supplier',
    nextAction, nextActionDueAt, supplierBreached, atRisk,
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
