// MOTIV health engine v3 — executive decision generator (spec §14.5)
import { THRESHOLDS } from './constants'
import type { StoreHealthResult } from './storeHealth'
import type { RegionalHealthResult } from './regionalHealth'
import type { SupplierPerformance } from './supplierPerformance'
import type { RepeatDefect } from './repeatDefects'

export type DecisionCategory =
  | 'Approve Investment' | 'Escalate Supplier' | 'Reallocate Budget' | 'Accept Risk'
  | 'Policy Exception' | 'Review Contract' | 'Change Strategy' | 'Monitor'

export interface DecisionScores {
  businessImpact: number
  urgency: number
  costEfficiency: number
  supplierReliability: number
  operationalBenefit: number
  strategicFit: number
}

export interface DecisionItem {
  category: DecisionCategory
  title: string
  context: string
  mainDriver: string
  businessImpact: string
  exposureValue: number | null
  urgency: 'high' | 'medium' | 'low'
  recommendedAction: string
  owner: string
  deadlineDays: number
  affectedStores: string[]
  weight: number
  scores: DecisionScores
  band: 'High' | 'Medium' | 'Low'
}

/** 6-axis decision summary (spec §14.5 drawer) — heuristic from the item. */
function scoreDecision(i: Omit<DecisionItem, 'scores' | 'band'>): { scores: DecisionScores; band: DecisionItem['band'] } {
  const urg = i.urgency === 'high' ? 90 : i.urgency === 'medium' ? 65 : 40
  const exp = i.exposureValue ?? 0
  const impact = i.businessImpact.match(/safety|trading|customer/i) ? 90 : exp > 1_000_000 ? 85 : exp > 250_000 ? 70 : 55
  const byCat: Record<DecisionCategory, Partial<DecisionScores>> = {
    'Approve Investment':  { costEfficiency: 75, operationalBenefit: 80, strategicFit: 70, supplierReliability: 60 },
    'Escalate Supplier':   { supplierReliability: 35, operationalBenefit: 70, strategicFit: 60, costEfficiency: 55 },
    'Reallocate Budget':   { costEfficiency: 80, operationalBenefit: 75, strategicFit: 65, supplierReliability: 60 },
    'Accept Risk':         { costEfficiency: 70, operationalBenefit: 45, strategicFit: 55, supplierReliability: 60 },
    'Policy Exception':    { costEfficiency: 60, operationalBenefit: 60, strategicFit: 50, supplierReliability: 60 },
    'Review Contract':     { supplierReliability: 45, costEfficiency: 65, operationalBenefit: 60, strategicFit: 70 },
    'Change Strategy':     { costEfficiency: 60, operationalBenefit: 85, strategicFit: 88, supplierReliability: 55 },
    'Monitor':             { costEfficiency: 70, operationalBenefit: 55, strategicFit: 60, supplierReliability: 65 },
  }
  const c = byCat[i.category]
  const scores: DecisionScores = {
    businessImpact: impact, urgency: urg,
    costEfficiency: c.costEfficiency ?? 60, supplierReliability: c.supplierReliability ?? 60,
    operationalBenefit: c.operationalBenefit ?? 60, strategicFit: c.strategicFit ?? 60,
  }
  const avg = (scores.businessImpact + scores.urgency + scores.costEfficiency + scores.supplierReliability + scores.operationalBenefit + scores.strategicFit) / 6
  return { scores, band: avg >= 75 ? 'High' : avg >= 55 ? 'Medium' : 'Low' }
}

export interface DecisionContext {
  topRiskStores: { store: StoreHealthResult; name: string }[]
  regions: { region: RegionalHealthResult; name: string }[]
  suppliers: { id: string; name: string; perf: SupplierPerformance }[]
  highValueDecisions: { ticketId: string; storeName: string; value: number; daysWaiting: number }[]
  repeatDefects: { defect: RepeatDefect; storeName: string }[]
}

type DraftDecision = Omit<DecisionItem, 'scores' | 'band'>

export function getExecutiveDecisionItems(ctx: DecisionContext): DecisionItem[] {
  const items: DraftDecision[] = []

  for (const r of ctx.topRiskStores.filter(s => s.store.finalStatus === 'critical').slice(0, 5)) {
    items.push({
      category: r.store.safetyOpen > 0 ? 'Accept Risk' : 'Change Strategy',
      title: `Intervene at ${r.name}`, context: r.store.mainIssue,
      mainDriver: r.store.mainIssue, businessImpact: r.store.safetyOpen > 0 ? 'Safety / trading' : 'Store critical',
      exposureValue: r.store.costExposure || null, urgency: 'high',
      recommendedAction: 'Assign owner today; clear the blocking action', owner: 'Executive + Regional Manager',
      deadlineDays: 1, affectedStores: [r.name], weight: 100,
    })
  }
  for (const a of ctx.highValueDecisions.slice(0, 5)) {
    items.push({
      category: 'Approve Investment', title: `Approve quote at ${a.storeName}`,
      context: `Quote ${fmt(a.value)} waiting ${a.daysWaiting} day(s)`, mainDriver: 'Commercial decision pending',
      businessImpact: a.value >= THRESHOLDS.highValueQuote * 2 ? 'High capital outlay' : 'Work blocked', exposureValue: a.value,
      urgency: a.daysWaiting > 3 ? 'high' : 'medium',
      recommendedAction: a.daysWaiting > 3 ? 'Decide now — internal SLA exceeded' : 'Review and decide',
      owner: a.value >= THRESHOLDS.highValueQuote * 2 ? 'Finance / Executive' : 'Regional Manager',
      deadlineDays: a.daysWaiting > 3 ? 1 : 2, affectedStores: [a.storeName], weight: 80 + Math.min(20, a.value / 10_000),
    })
  }
  for (const s of ctx.suppliers.filter(s => s.perf.band === 'critical' || s.perf.band === 'at_risk').slice(0, 5)) {
    items.push({
      category: s.perf.band === 'critical' ? 'Escalate Supplier' : 'Review Contract',
      title: `Review supplier ${s.name}`,
      context: `${s.perf.slaBreaches} SLA breaches, ${Math.round(s.perf.firstTimeFixRate * 100)}% first-time-fix over ${s.perf.assignedTickets} tickets`,
      mainDriver: 'Supplier underperformance', businessImpact: 'Repeat cost + SLA risk', exposureValue: null,
      urgency: s.perf.band === 'critical' ? 'high' : 'medium',
      recommendedAction: s.perf.band === 'critical' ? 'Begin replacement / re-tender' : 'Performance review',
      owner: 'Procurement / Supplier role', deadlineDays: 7, affectedStores: [], weight: 70 + (100 - s.perf.performanceScore) / 5,
    })
  }
  for (const d of ctx.repeatDefects.filter(d => d.defect.count >= 3).slice(0, 5)) {
    items.push({
      category: d.defect.possibleRootCause.startsWith('Recurring across') ? 'Approve Investment' : 'Change Strategy',
      title: `Address repeat ${d.defect.category} at ${d.storeName}`,
      context: `${d.defect.count} occurrences in ${THRESHOLDS.repeatWindowDays} days`, mainDriver: d.defect.possibleRootCause,
      businessImpact: 'Recurring cost + store-health drag', exposureValue: null, urgency: 'medium',
      recommendedAction: d.defect.suggestedAction, owner: 'Regional Manager', deadlineDays: 14, affectedStores: [d.storeName], weight: 60 + d.defect.count * 3,
    })
  }
  for (const reg of ctx.regions.filter(r => r.region.status === 'at_risk' || r.region.status === 'critical').slice(0, 3)) {
    items.push({
      category: reg.region.status === 'critical' ? 'Reallocate Budget' : 'Monitor',
      title: `Support ${reg.name} region`, context: reg.region.mainReason, mainDriver: reg.region.mainReason,
      businessImpact: `${reg.region.activeStores} stores · health ${reg.region.finalPortfolioHealth}%`, exposureValue: reg.region.costExposure || null,
      urgency: reg.region.status === 'critical' ? 'high' : 'low',
      recommendedAction: reg.region.status === 'critical' ? 'Executive review this week' : 'Weekly check-in',
      owner: 'Executive', deadlineDays: reg.region.status === 'critical' ? 3 : 7, affectedStores: [], weight: 50 + reg.region.riskPenalty,
    })
  }

  const sorted = items.sort((a, b) => b.weight - a.weight)
  if (!sorted.length) sorted.push({
    category: 'Monitor', title: 'No executive decisions outstanding', context: 'Estate controlled',
    mainDriver: '—', businessImpact: '—', exposureValue: null, urgency: 'low',
    recommendedAction: 'Continue monitoring', owner: '—', deadlineDays: 30, affectedStores: [], weight: 0,
  })
  return sorted.map(i => ({ ...i, ...scoreDecision(i) }))
}

function fmt(n: number) { return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n) }
