// ============================================================
// Dashboards v2 — dual-SLA + blocker engine (spec §6, §12.5, §12.6)
//
// Two independent clocks per ticket:
//   • Supplier SLA   — supplier-controlled actions (respond, attend, resolve)
//   • Internal SLA   — internally-controlled actions (approve quote, give
//                      access, confirm completion, respond to escalation)
//
// The supplier clock PAUSES while the ball is in the internal/store court,
// but the internal clock keeps RUNNING — so delays are never hidden.
// ============================================================
import type { Ticket, SlaRule, BlockerOwnerType } from '@/lib/types'

const MIN = 60_000

const TERMINAL = new Set(['completed', 'cancelled', 'declined'])

export type SupplierSlaStatus =
  | 'not_started' | 'running' | 'paused' | 'breached'
  | 'completed_within' | 'completed_late' | 'closed'
export type InternalSlaStatus = 'not_running' | 'running' | 'breached' | 'met'

export interface SlaResult {
  supplierStatus: SupplierSlaStatus
  internalStatus: InternalSlaStatus
  currentBlocker: string | null          // quote_approval | store_access | supplier_action | instruction | completion_confirm | escalation | null
  blockerOwnerType: BlockerOwnerType | null
  blockerStartedAt: string | null
  daysWithBlocker: number | null
  delayOwner: 'supplier' | 'internal' | 'store' | 'none'
  nextAction: string
  nextActionDueAt: string | null
  supplierBreached: boolean
  internalBreached: boolean
  /** Visual-language label (spec §16). */
  label:
    | 'Healthy' | 'At Risk' | 'Breached'
    | 'Blocked by Supplier' | 'Blocked by Internal Action'
    | 'Blocked by Approval' | 'Blocked by Store Access'
    | 'Completed Within SLA' | 'Completed Late'
}

function addMins(iso: string, mins: number): string {
  return new Date(new Date(iso).getTime() + mins * MIN).toISOString()
}

function daysBetween(fromIso: string | null, now: Date): number | null {
  if (!fromIso) return null
  return Math.max(0, Math.floor((now.getTime() - new Date(fromIso).getTime()) / (24 * 60 * MIN)))
}

/**
 * Resolve effective SLA due timestamps. Uses the explicit ticket timestamps
 * when present; otherwise derives them from created_at + the matching rule so
 * legacy tickets (created before SLA fields existed) still score.
 */
export function deriveDueDates(ticket: Ticket, rule: SlaRule) {
  const created = ticket.created_at
  return {
    firstResponseDue: ticket.first_response_due_at ?? addMins(created, rule.first_response_mins),
    attendanceDue: ticket.attendance_due_at ?? addMins(created, rule.attendance_mins),
    resolutionDue:
      ticket.adjusted_resolution_due_at ??
      ticket.resolution_due_at ??
      addMins(created, rule.resolution_mins),
    quoteApprovalDue:
      ticket.internal_action_due_at ??
      (ticket.quote_submitted_at ? addMins(ticket.quote_submitted_at, rule.quote_approval_mins) : null),
  }
}

/**
 * Compute the dual-SLA state for one ticket.
 * `now` is injected for testability.
 */
export function computeTicketSla(ticket: Ticket, rule: SlaRule, now: Date = new Date()): SlaResult {
  const due = deriveDueDates(ticket, rule)

  // ── Terminal tickets — report completed within / late, no live clock ──
  if (TERMINAL.has(ticket.status)) {
    if (ticket.status === 'completed') {
      const completedAt = ticket.completed_at ?? ticket.updated_at
      const late = new Date(completedAt).getTime() > new Date(due.resolutionDue).getTime()
      return base({
        supplierStatus: late ? 'completed_late' : 'completed_within',
        internalStatus: 'met',
        label: late ? 'Completed Late' : 'Completed Within SLA',
        nextAction: 'None — closed',
      })
    }
    return base({ supplierStatus: 'closed', internalStatus: 'met', label: 'Healthy', nextAction: 'None — closed' })
  }

  // ── Determine the active blocker / who owns the next action ──
  const waitingApproval =
    ticket.status === 'quoted' ||
    ticket.status === 'variation_pending' ||
    (ticket.quote_approval_required === true && ticket.quote_approval_status === 'pending')

  const waitingStoreAccess =
    ticket.store_confirmation_required === true &&
    !ticket.store_confirmed_at &&
    (ticket.status === 'accepted' || ticket.status === 'in_progress')

  const explicitBlocker = ticket.current_blocker ?? null

  let currentBlocker: string | null
  let blockerOwnerType: BlockerOwnerType | null
  let supplierStatus: SupplierSlaStatus
  let internalStatus: InternalSlaStatus
  let delayOwner: 'supplier' | 'internal' | 'store' | 'none'
  let nextAction: string
  let nextActionDueAt: string | null
  let internalBreached = false

  if (waitingApproval || explicitBlocker === 'quote_approval') {
    currentBlocker = 'quote_approval'
    blockerOwnerType = (ticket.blocker_owner_type as BlockerOwnerType) ?? 'regional_manager'
    supplierStatus = 'paused'
    internalStatus = 'running'
    delayOwner = 'internal'
    nextAction = 'Review & approve/decline the quote'
    nextActionDueAt = due.quoteApprovalDue
    internalBreached = !!nextActionDueAt && now.getTime() > new Date(nextActionDueAt).getTime()
  } else if (waitingStoreAccess || explicitBlocker === 'store_access') {
    currentBlocker = 'store_access'
    blockerOwnerType = (ticket.blocker_owner_type as BlockerOwnerType) ?? 'store'
    supplierStatus = 'paused'
    internalStatus = 'running'
    delayOwner = 'store'
    nextAction = 'Confirm store access for the supplier'
    nextActionDueAt = ticket.internal_action_due_at ?? null
    internalBreached = !!nextActionDueAt && now.getTime() > new Date(nextActionDueAt).getTime()
  } else if (explicitBlocker === 'completion_confirm') {
    currentBlocker = 'completion_confirm'
    blockerOwnerType = (ticket.blocker_owner_type as BlockerOwnerType) ?? 'regional_manager'
    supplierStatus = 'paused'
    internalStatus = 'running'
    delayOwner = 'internal'
    nextAction = 'Confirm completion / sign off'
    nextActionDueAt = ticket.internal_action_due_at ?? null
    internalBreached = !!nextActionDueAt && now.getTime() > new Date(nextActionDueAt).getTime()
  } else {
    // Ball is with the supplier
    currentBlocker = ticket.sla_paused ? (explicitBlocker ?? null) : 'supplier_action'
    blockerOwnerType = 'supplier'
    internalStatus = 'not_running'
    delayOwner = 'supplier'
    // Supplier breach checks — first response, attendance, resolution
    const fr = !ticket.first_response_at && now.getTime() > new Date(due.firstResponseDue).getTime()
    const att = !ticket.attended_at && now.getTime() > new Date(due.attendanceDue).getTime()
    const res = now.getTime() > new Date(due.resolutionDue).getTime()
    if (ticket.sla_paused) {
      supplierStatus = 'paused'
      delayOwner = 'internal'
    } else if (fr || att || res) {
      supplierStatus = 'breached'
    } else if (!ticket.first_response_at) {
      supplierStatus = 'not_started'
    } else {
      supplierStatus = 'running'
    }
    if (!ticket.first_response_at) {
      nextAction = 'Supplier to acknowledge'
      nextActionDueAt = due.firstResponseDue
    } else if (!ticket.attended_at) {
      nextAction = 'Supplier to attend site'
      nextActionDueAt = due.attendanceDue
    } else {
      nextAction = 'Supplier to complete work'
      nextActionDueAt = due.resolutionDue
    }
  }

  // ── Supplier resolution breach can co-exist with a pause if the
  //    adjusted due date has passed regardless (rare). ──
  const supplierBreached = supplierStatus === 'breached'
  const blockerStartedAt = ticket.blocker_started_at ?? null
  const daysWithBlocker = daysBetween(blockerStartedAt, now)

  // ── Derive the visual label ──
  let label: SlaResult['label']
  if (currentBlocker === 'quote_approval') label = 'Blocked by Approval'
  else if (currentBlocker === 'store_access') label = 'Blocked by Store Access'
  else if (internalStatus === 'running' || currentBlocker === 'completion_confirm') label = 'Blocked by Internal Action'
  else if (supplierBreached) label = 'Breached'
  else if (supplierStatus === 'paused') label = 'Blocked by Supplier'
  else label = isAtRisk(ticket, due, now) ? 'At Risk' : 'Healthy'

  return {
    supplierStatus, internalStatus, currentBlocker, blockerOwnerType,
    blockerStartedAt, daysWithBlocker, delayOwner, nextAction, nextActionDueAt,
    supplierBreached, internalBreached, label,
  }

  function base(p: Partial<SlaResult> & Pick<SlaResult, 'supplierStatus' | 'internalStatus' | 'label' | 'nextAction'>): SlaResult {
    return {
      currentBlocker: null, blockerOwnerType: null, blockerStartedAt: null,
      daysWithBlocker: null, delayOwner: 'none', nextActionDueAt: null,
      supplierBreached: false, internalBreached: false, ...p,
    }
  }
}

/** Within 20% of resolution due (and not breached) → flagged At Risk. */
function isAtRisk(ticket: Ticket, due: ReturnType<typeof deriveDueDates>, now: Date): boolean {
  const created = new Date(ticket.created_at).getTime()
  const dueT = new Date(due.resolutionDue).getTime()
  const span = dueT - created
  if (span <= 0) return false
  const elapsed = now.getTime() - created
  return elapsed / span >= 0.8
}

/** True when a supplier breach is older than `days` (used for regional penalties). */
export function supplierBreachOlderThan(ticket: Ticket, rule: SlaRule, days: number, now = new Date()): boolean {
  const sla = computeTicketSla(ticket, rule, now)
  if (!sla.supplierBreached) return false
  const due = deriveDueDates(ticket, rule)
  return now.getTime() - new Date(due.resolutionDue).getTime() > days * 24 * 60 * MIN
}

/** True when an internal breach is older than `days`. */
export function internalBreachOlderThan(ticket: Ticket, rule: SlaRule, days: number, now = new Date()): boolean {
  const sla = computeTicketSla(ticket, rule, now)
  if (!sla.internalBreached || !sla.nextActionDueAt) return false
  return now.getTime() - new Date(sla.nextActionDueAt).getTime() > days * 24 * 60 * MIN
}
