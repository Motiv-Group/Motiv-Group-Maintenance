// ============================================================
// Dashboards v2 — getExecutiveDecisionItems (spec §8.2.J, §12.12)
//
// Turns the computed signals into a short, ranked list of decisions an
// executive must make — each with the reason, value/impact, recommended
// action, owner and a deadline. This is the heart of "decision-driven".
// ============================================================
import { THRESHOLDS } from './constants'
import type { RankedStore } from './ranking'
import type { RegionalHealthResult } from './regionalHealth'
import type { RepeatDefect } from './repeatDefects'
import type { SupplierPerformance } from './supplierPerformance'

export type DecisionCategory =
  | 'Approve' | 'Escalate' | 'Fund' | 'Replace supplier'
  | 'Review strategy' | 'Monitor' | 'No action required'

export interface DecisionItem {
  category: DecisionCategory
  decisionRequired: string
  reason: string
  value: string          // value / impact (human readable)
  recommendedAction: string
  owner: string
  deadlineDays: number   // suggested SLA for the decision itself
  weight: number         // internal sort key
}

export interface DecisionContext {
  topRiskStores: RankedStore[]
  regions: RegionalHealthResult[]
  repeatDefects: RepeatDefect[]
  suppliers: { id: string; name: string; perf: SupplierPerformance }[]
  pendingApprovalValue: number
  highValueApprovals: { ticketId: string; storeName: string; value: number; daysWaiting: number }[]
  storeName: (id: string) => string
  regionName: (id: string) => string
}

export function getExecutiveDecisionItems(ctx: DecisionContext): DecisionItem[] {
  const items: DecisionItem[] = []

  // 1. Critical stores → Escalate
  for (const r of ctx.topRiskStores.filter(s => s.store.finalRag === 'critical').slice(0, 5)) {
    items.push({
      category: 'Escalate',
      decisionRequired: `Intervene at ${ctx.storeName(r.store.storeId)}`,
      reason: r.store.mainIssue,
      value: r.store.safetyOpen > 0 ? 'Safety / trading risk' : 'Store health critical',
      recommendedAction: 'Assign an owner today and clear the blocking action',
      owner: 'Regional Manager + Executive',
      deadlineDays: 1,
      weight: 100 + r.risk,
    })
  }

  // 2. High-value approvals waiting → Approve / Fund
  for (const a of ctx.highValueApprovals.slice(0, 5)) {
    const fund = a.value >= THRESHOLDS.highValueQuote * 2
    items.push({
      category: fund ? 'Fund' : 'Approve',
      decisionRequired: `${fund ? 'Fund' : 'Approve'} quote at ${a.storeName}`,
      reason: `Quote of ${fmt(a.value)} awaiting decision for ${a.daysWaiting} day(s)`,
      value: fmt(a.value),
      recommendedAction: a.daysWaiting > 3 ? 'Decide now — internal SLA exceeded' : 'Review and decide',
      owner: a.value >= THRESHOLDS.highValueQuote * 2 ? 'Finance / Executive' : 'Regional Manager',
      deadlineDays: a.daysWaiting > 3 ? 1 : 2,
      weight: 80 + Math.min(20, a.value / 10_000) + a.daysWaiting,
    })
  }

  // 3. Underperforming suppliers → Replace / Review
  for (const s of ctx.suppliers.filter(s => s.perf.band === 'critical' || s.perf.band === 'red').slice(0, 5)) {
    items.push({
      category: s.perf.band === 'critical' ? 'Replace supplier' : 'Review strategy',
      decisionRequired: `Review supplier ${s.name}`,
      reason: `${s.perf.slaBreaches} SLA breaches, ${Math.round(s.perf.firstTimeFixRate * 100)}% first-time-fix across ${s.perf.assignedTickets} tickets`,
      value: `${s.perf.assignedTickets} tickets, ${s.perf.repeatDefectInvolvement} repeat defects`,
      recommendedAction: s.perf.band === 'critical' ? 'Begin replacement / re-tender' : 'Performance review with supplier',
      owner: 'Supplier role / Procurement',
      deadlineDays: 7,
      weight: 70 + (100 - s.perf.performanceScore) / 5,
    })
  }

  // 4. Repeat-defect patterns → Review strategy / Fund (CAPEX)
  for (const d of ctx.repeatDefects.filter(d => d.count >= 3).slice(0, 5)) {
    items.push({
      category: d.possibleRootCause.startsWith('Recurring across') ? 'Fund' : 'Review strategy',
      decisionRequired: `Address repeat ${d.category} at ${ctx.storeName(d.storeId)}`,
      reason: `${d.count} occurrences in ${THRESHOLDS.repeatWindowDays} days — ${d.possibleRootCause}`,
      value: 'Recurring cost + store-health drag',
      recommendedAction: d.suggestedAction,
      owner: 'Regional Manager',
      deadlineDays: 14,
      weight: 60 + d.count * 3,
    })
  }

  // 5. Regions at risk → Monitor / Review
  for (const reg of ctx.regions.filter(r => r.rag === 'red' || r.rag === 'critical').slice(0, 3)) {
    items.push({
      category: reg.rag === 'critical' ? 'Escalate' : 'Monitor',
      decisionRequired: `Support ${ctx.regionName(reg.regionId)} region`,
      reason: reg.mainReason,
      value: `${reg.activeStores} stores · health ${reg.finalPortfolioHealth}%`,
      recommendedAction: reg.rag === 'critical' ? 'Executive review with the RM this week' : 'Weekly check-in with the RM',
      owner: 'Executive + Regional Manager',
      deadlineDays: reg.rag === 'critical' ? 3 : 7,
      weight: 50 + reg.riskPenalty,
    })
  }

  const sorted = items.sort((a, b) => b.weight - a.weight)
  if (sorted.length === 0) {
    sorted.push({
      category: 'No action required',
      decisionRequired: 'No executive decisions outstanding',
      reason: 'Estate is controlled across all measured dimensions',
      value: '—', recommendedAction: 'Continue monitoring', owner: '—', deadlineDays: 30, weight: 0,
    })
  }
  return sorted
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
}
