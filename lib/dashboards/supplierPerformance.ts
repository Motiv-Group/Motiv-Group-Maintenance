// ============================================================
// Dashboards v2 — calculateSupplierPerformance (spec §12.8)
//
// Performance for one supplier (trade company) over a set of tickets, optionally
// scoped to a region. Produces the metrics shown in the regional "Supplier
// Performance" and executive "Supplier Performance Overview" sections.
// ============================================================
import type { Ticket, SlaRule, RagStatus } from '@/lib/types'
import { computeTicketSla } from './sla'
import { ragForScore } from './constants'
import type { RuleResolver } from './storeHealth'

const MIN = 60_000

export interface SupplierPerformance {
  supplierId: string
  assignedTickets: number
  completedTickets: number
  slaBreaches: number
  avgResponseMins: number | null
  avgResolutionMins: number | null
  firstTimeFixRate: number   // 0..1
  repeatDefectInvolvement: number
  evidenceCompletionRate: number  // 0..1
  escalationCount: number
  performanceScore: number   // 0..100
  band: RagStatus
}

export function calculateSupplierPerformance(
  supplierId: string,
  tickets: Ticket[],
  ruleFor: RuleResolver,
  now: Date = new Date(),
): SupplierPerformance {
  const assigned = tickets.length
  const completed = tickets.filter(t => t.status === 'completed')

  let slaBreaches = 0
  let escalationCount = 0
  for (const t of tickets) {
    const sla = computeTicketSla(t, ruleFor(t.priority), now)
    if (sla.supplierBreached || sla.supplierStatus === 'completed_late') slaBreaches++
    if (t.severity === 'critical' && (sla.supplierBreached || sla.internalBreached)) escalationCount++
  }

  const responseMins = avg(tickets
    .filter(t => t.first_response_at)
    .map(t => (new Date(t.first_response_at!).getTime() - new Date(t.created_at).getTime()) / MIN))
  const resolutionMins = avg(completed
    .map(t => ((new Date(t.completed_at ?? t.updated_at).getTime()) - new Date(t.created_at).getTime()) / MIN))

  const repeatDefectInvolvement = tickets.filter(t => t.repeat_defect_flag).length
  const firstTimeFixRate = completed.length > 0
    ? completed.filter(t => !t.repeat_defect_flag).length / completed.length
    : 1

  // Supplier owes after photos + COC; before photos come from ticket logging.
  const needEvidence = completed.filter(t => t.evidence_required)
  const evidenceCompletionRate = needEvidence.length > 0
    ? needEvidence.filter(t => t.after_photo_uploaded && t.completion_certificate_uploaded).length / needEvidence.length
    : 1

  // Score: deductive from 100
  let score = 100
  if (assigned > 0) score -= (slaBreaches / assigned) * 40
  score -= (1 - firstTimeFixRate) * 20
  score -= (1 - evidenceCompletionRate) * 15
  if (assigned > 0) score -= (repeatDefectInvolvement / assigned) * 15
  score -= Math.min(10, escalationCount * 2)
  score = Math.max(0, Math.min(100, Math.round(score)))

  return {
    supplierId,
    assignedTickets: assigned,
    completedTickets: completed.length,
    slaBreaches,
    avgResponseMins: responseMins,
    avgResolutionMins: resolutionMins,
    firstTimeFixRate: round2(firstTimeFixRate),
    repeatDefectInvolvement,
    evidenceCompletionRate: round2(evidenceCompletionRate),
    escalationCount,
    performanceScore: score,
    band: ragForScore(score) ?? 'critical',
  }
}

function avg(xs: number[]): number | null {
  if (xs.length === 0) return null
  return Math.round(xs.reduce((s, x) => s + x, 0) / xs.length)
}
function round2(n: number) { return Math.round(n * 100) / 100 }
