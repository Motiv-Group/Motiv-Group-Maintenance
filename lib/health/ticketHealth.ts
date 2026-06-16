// MOTIV health engine v3 — per-ticket health (for action lists / supplier perf)
import type { HealthTicket, SlaTargets } from './types'
import { isActive } from './types'
import { computeTicketSla, type SlaResult } from './sla'

export interface TicketHealth { score: number; sla: SlaResult }

export function calculateTicketHealth(t: HealthTicket, s: SlaTargets, now: Date = new Date()): TicketHealth {
  const sla = computeTicketSla(t, s, now)
  if (t.status === 'completed') return { score: sla.supplierStatus === 'completed_late' ? 70 : 100, sla }
  if (!isActive(t.status)) return { score: 100, sla }

  let score = 100
  if (sla.supplierBreached) score -= 25
  if (sla.internalBreached) score -= 25
  if (sla.atRisk) score -= 8
  if (t.priority === 'P1') score -= 15
  else if (t.priority === 'P2') score -= 8
  if (t.safety_risk_flag) score -= 20
  if (t.trading_impact_flag) score -= 12
  if (sla.daysWithBlocker != null) score -= Math.min(20, sla.daysWithBlocker * 2)
  if (t.repeat_defect_flag) score -= 10
  if (t.evidence_required && (t.status === 'submitted_for_signoff' || t.status === 'in_progress')) {
    if (!t.before_photo_uploaded) score -= 4
    if (!t.after_photo_uploaded) score -= 4
    if (!t.completion_certificate_uploaded) score -= 4
  }
  return { score: Math.max(0, Math.min(100, Math.round(score))), sla }
}
