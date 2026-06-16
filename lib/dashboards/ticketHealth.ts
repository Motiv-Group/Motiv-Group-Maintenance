// ============================================================
// Dashboards v2 — calculateTicketHealth (spec §12.1)
//
// Per-ticket 0-100 health. Feeds the store SLA/operational sub-scores and the
// "tickets needing action" lists. Deductive model: start at 100, subtract for
// breaches, severity, impact flags, ageing, blocker age, missing evidence and
// repeat-defect involvement.
// ============================================================
import type { Ticket, SlaRule } from '@/lib/types'
import { computeTicketSla, deriveDueDates, type SlaResult } from './sla'

const TERMINAL = new Set(['completed', 'cancelled', 'declined'])

export interface TicketHealth {
  score: number
  status: SlaResult['label']
  sla: SlaResult
}

export function calculateTicketHealth(ticket: Ticket, rule: SlaRule, now: Date = new Date()): TicketHealth {
  const sla = computeTicketSla(ticket, rule, now)

  if (ticket.status === 'completed') {
    return { score: sla.supplierStatus === 'completed_late' ? 70 : 100, status: sla.label, sla }
  }
  if (TERMINAL.has(ticket.status)) {
    return { score: 100, status: sla.label, sla }
  }

  let score = 100
  if (sla.supplierBreached) score -= 25
  if (sla.internalBreached) score -= 25

  if (ticket.severity === 'critical') score -= 15
  else if (ticket.severity === 'high') score -= 8

  if (ticket.safety_risk_flag) score -= 20
  if (ticket.trading_impact_flag) score -= 12

  // Overdue magnitude — how far past resolution due (capped)
  const due = deriveDueDates(ticket, rule)
  const overdueMs = now.getTime() - new Date(due.resolutionDue).getTime()
  if (overdueMs > 0 && !sla.supplierBreached) {
    const overdueDays = overdueMs / (24 * 3600_000)
    score -= Math.min(20, Math.round(overdueDays * 3))
  }

  // Blocker age — each day a ticket sits blocked erodes health
  if (sla.daysWithBlocker != null) score -= Math.min(20, sla.daysWithBlocker * 2)

  // Missing evidence on work that should have it
  if (ticket.evidence_required && (ticket.status === 'pending_sign_off' || ticket.status === 'in_progress')) {
    if (!ticket.before_photo_uploaded) score -= 4
    if (!ticket.after_photo_uploaded) score -= 4
    if (!ticket.completion_certificate_uploaded) score -= 4
  }

  if (ticket.repeat_defect_flag) score -= 10

  score = Math.max(0, Math.min(100, Math.round(score)))

  // Refine label: a low score that isn't otherwise blocked reads as "At Risk".
  let status = sla.label
  if (!TERMINAL.has(ticket.status) && status === 'Healthy' && score < 70) status = 'At Risk'

  return { score, status, sla }
}
