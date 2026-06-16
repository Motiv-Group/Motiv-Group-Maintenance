// MOTIV health engine v3 — Estate Health (spec §11)
import type { HealthStatus } from './types'
import { ESTATE_PENALTIES, THRESHOLDS, statusForScore } from './constants'
import type { RegionalHealthResult, StatusCounts } from './regionalHealth'

export interface EstateTrendSignals {
  supplierTrendUp: boolean
  internalTrendUp: boolean
  commercialBacklogUp: boolean
  repeatTrendUp: boolean
  criticalTicketOverdue: boolean
  costExposure: number
  openTickets: number
  criticalTickets: number
  decisionsPending: number
  supplierSlaBreaches: number
  internalSlaBreaches: number
}
export interface EstateHealthResult {
  weightedRegionalHealth: number
  riskPenalty: number
  appliedPenalties: string[]
  finalEstateHealth: number
  status: HealthStatus
  totalActiveStores: number
  counts: StatusCounts
  regionsCritical: number
  pctCritical: number
  pctAtRisk: number
  openTickets: number
  criticalTickets: number
  decisionsPending: number
  supplierSlaBreaches: number
  internalSlaBreaches: number
  costExposure: number
  mainRiskDriver: string
}

export function calculateEstateHealth(regions: RegionalHealthResult[], sig: EstateTrendSignals): EstateHealthResult {
  const totalActiveStores = regions.reduce((s, r) => s + r.activeStores, 0)
  const weightedRegionalHealth = totalActiveStores
    ? round(regions.reduce((s, r) => s + r.finalPortfolioHealth * r.activeStores, 0) / totalActiveStores) : 100

  const counts: StatusCounts = { controlled: 0, attention: 0, at_risk: 0, critical: 0 }
  for (const r of regions) {
    counts.controlled += r.counts.controlled; counts.attention += r.counts.attention
    counts.at_risk += r.counts.at_risk; counts.critical += r.counts.critical
  }
  const regionsCritical = regions.filter(r => r.status === 'critical').length
  const pctCritical = totalActiveStores ? (counts.critical / totalActiveStores) * 100 : 0
  const pctAtRisk = totalActiveStores ? (counts.at_risk / totalActiveStores) * 100 : 0

  const applied: string[] = []
  let penalty = 0
  const add = (c: boolean, amt: number, label: string) => { if (c) { penalty += amt; applied.push(label) } }
  add(regionsCritical > 0, ESTATE_PENALTIES.anyCriticalRegion, `${regionsCritical} critical region(s)`)
  add(pctCritical > 5, ESTATE_PENALTIES.criticalStoresOver5pct, `${pctCritical.toFixed(1)}% stores critical`)
  add(pctAtRisk > 10, ESTATE_PENALTIES.atRiskStoresOver10pct, `${pctAtRisk.toFixed(1)}% stores at risk`)
  add(sig.supplierTrendUp, ESTATE_PENALTIES.supplierTrendUp, 'Supplier SLA breaches trending up')
  add(sig.internalTrendUp, ESTATE_PENALTIES.internalTrendUp, 'Internal SLA breaches trending up')
  add(sig.commercialBacklogUp, ESTATE_PENALTIES.commercialBacklogUp, 'Commercial decision backlog increasing')
  add(sig.repeatTrendUp, ESTATE_PENALTIES.repeatTrendUp, 'Repeat defects increasing')
  add(sig.costExposure > THRESHOLDS.estateCostExposure, ESTATE_PENALTIES.costExposureOverThreshold, 'Cost exposure above threshold')
  add(sig.criticalTicketOverdue, ESTATE_PENALTIES.criticalTicketOverdue, 'Critical ticket overdue across estate')

  const finalEstateHealth = clamp(round(weightedRegionalHealth - penalty), 0, 100)
  return {
    weightedRegionalHealth, riskPenalty: penalty, appliedPenalties: applied,
    finalEstateHealth, status: statusForScore(finalEstateHealth),
    totalActiveStores, counts, regionsCritical, pctCritical: round(pctCritical), pctAtRisk: round(pctAtRisk),
    openTickets: sig.openTickets, criticalTickets: sig.criticalTickets, decisionsPending: sig.decisionsPending,
    supplierSlaBreaches: sig.supplierSlaBreaches, internalSlaBreaches: sig.internalSlaBreaches, costExposure: sig.costExposure,
    mainRiskDriver: applied[0] ?? (statusForScore(finalEstateHealth) === 'controlled' ? 'Estate controlled' : 'Multiple regions need attention'),
  }
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)) }
function round(n: number) { return Math.round(n) }
