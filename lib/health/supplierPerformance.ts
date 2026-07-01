// MOTIV health engine v3 — supplier performance
import type { HealthTicket, HealthStatus, SlaRuleResolver } from './types'
import { computeTicketSla } from './sla'
import { statusForScore } from './constants'

const MIN = 60_000

export interface SupplierPerformance {
  supplierId: string
  assignedTickets: number
  completedTickets: number
  slaBreaches: number
  avgResponseMins: number | null
  avgResolutionMins: number | null
  firstTimeFixRate: number
  repeatDefectInvolvement: number
  evidenceCompletionRate: number
  escalationCount: number
  performanceScore: number
  band: HealthStatus
}

export function calculateSupplierPerformance(
  supplierId: string, tickets: HealthTicket[], rules: SlaRuleResolver, now: Date = new Date(),
): SupplierPerformance {
  const assigned = tickets.length
  const completed = tickets.filter(t => t.status === 'completed')
  let slaBreaches = 0, escalationCount = 0
  for (const t of tickets) {
    const sla = computeTicketSla(t, rules(t.priority), now)
    if (sla.supplierBreached || sla.supplierStatus === 'completed_late') slaBreaches++
    if (t.priority === 'P1' && (sla.supplierBreached || sla.internalBreached)) escalationCount++
  }
  const responseMins = avg(tickets.filter(t => t.first_response_at)
    .map(t => (new Date(t.first_response_at!).getTime() - new Date(t.created_at).getTime()) / MIN))
  const resolutionMins = avg(completed
    .map(t => (new Date(t.completed_at ?? t.updated_at).getTime() - new Date(t.created_at).getTime()) / MIN))
  const repeatDefectInvolvement = tickets.filter(t => t.repeat_defect_flag).length
  const firstTimeFixRate = completed.length ? completed.filter(t => !t.repeat_defect_flag).length / completed.length : 1
  // Evidence the supplier is responsible for = after photos + COC. Before photos
  // are captured when the ticket is logged (tickets.photo_urls), not by the
  // supplier, so they don't count against the supplier's evidence completion.
  const needEvidence = completed.filter(t => t.evidence_required)
  const evidenceCompletionRate = needEvidence.length
    ? needEvidence.filter(t => t.after_photo_uploaded && t.completion_certificate_uploaded).length / needEvidence.length : 1

  let score = 100
  if (assigned > 0) score -= (slaBreaches / assigned) * 40
  score -= (1 - firstTimeFixRate) * 20
  score -= (1 - evidenceCompletionRate) * 15
  if (assigned > 0) score -= (repeatDefectInvolvement / assigned) * 15
  score -= Math.min(10, escalationCount * 2)
  score = Math.max(0, Math.min(100, Math.round(score)))

  return {
    supplierId, assignedTickets: assigned, completedTickets: completed.length, slaBreaches,
    avgResponseMins: responseMins, avgResolutionMins: resolutionMins,
    firstTimeFixRate: round2(firstTimeFixRate), repeatDefectInvolvement,
    evidenceCompletionRate: round2(evidenceCompletionRate), escalationCount,
    performanceScore: score, band: statusForScore(score),
  }
}

function avg(xs: number[]): number | null { return xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null }
function round2(n: number) { return Math.round(n * 100) / 100 }
