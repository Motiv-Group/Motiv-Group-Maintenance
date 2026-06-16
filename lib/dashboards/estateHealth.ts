// ============================================================
// Dashboards v2 — calculateExecutiveEstateHealth (spec §5, §12.4)
//
// Estate Health = store-count-weighted average of regional portfolio health
// − Estate Risk Penalty. Weighting by store count means a large struggling
// region moves the estate number more than a tiny one.
// ============================================================
import type { RagStatus } from '@/lib/types'
import { ESTATE_PENALTIES, THRESHOLDS, ragForScore } from './constants'
import type { RegionalHealthResult, RagCounts } from './regionalHealth'

export interface EstateTrendSignals {
  supplierSlaTrendUp: boolean
  internalSlaTrendUp: boolean
  quoteBacklogTrendUp: boolean
  repeatDefectsTrendUp: boolean
  criticalTicketOverdue: boolean
  costExposure: number
  openTickets: number
  criticalTickets: number
  quotesAwaitingApproval: number
  supplierSlaBreaches: number
  internalSlaBreaches: number
}

export interface EstateHealthResult {
  weightedRegionalHealth: number
  riskPenalty: number
  appliedPenalties: string[]
  finalEstateHealth: number
  rag: RagStatus
  totalActiveStores: number
  counts: RagCounts
  regionsCritical: number
  pctCritical: number
  pctRed: number
  openTickets: number
  criticalTickets: number
  quotesAwaitingApproval: number
  supplierSlaBreaches: number
  internalSlaBreaches: number
  costExposure: number
  mainRiskDriver: string
}

export function calculateExecutiveEstateHealth(
  regions: RegionalHealthResult[],
  signals: EstateTrendSignals,
): EstateHealthResult {
  const totalActiveStores = regions.reduce((s, r) => s + r.activeStores, 0)

  const weightedRegionalHealth = totalActiveStores > 0
    ? round(regions.reduce((s, r) => s + r.finalPortfolioHealth * r.activeStores, 0) / totalActiveStores)
    : 100

  const counts: RagCounts = { green: 0, amber: 0, red: 0, critical: 0 }
  for (const r of regions) {
    counts.green += r.counts.green
    counts.amber += r.counts.amber
    counts.red += r.counts.red
    counts.critical += r.counts.critical
  }
  const regionsCritical = regions.filter(r => r.rag === 'critical').length
  const pctCritical = totalActiveStores > 0 ? (counts.critical / totalActiveStores) * 100 : 0
  const pctRed = totalActiveStores > 0 ? (counts.red / totalActiveStores) * 100 : 0

  const applied: string[] = []
  let penalty = 0
  const add = (cond: boolean, amt: number, label: string) => { if (cond) { penalty += amt; applied.push(label) } }

  add(regionsCritical > 0, ESTATE_PENALTIES.anyCriticalRegion, `${regionsCritical} critical region(s)`)
  add(pctCritical > 5, ESTATE_PENALTIES.criticalStoresOver5pct, `${pctCritical.toFixed(1)}% of stores critical`)
  add(pctRed > 10, ESTATE_PENALTIES.redStoresOver10pct, `${pctRed.toFixed(1)}% of stores red`)
  add(signals.supplierSlaTrendUp, ESTATE_PENALTIES.supplierSlaTrendUp, 'Supplier SLA breaches trending up')
  add(signals.internalSlaTrendUp, ESTATE_PENALTIES.internalSlaTrendUp, 'Internal SLA breaches trending up')
  add(signals.quoteBacklogTrendUp, ESTATE_PENALTIES.quoteBacklogTrendUp, 'Quote approval backlog increasing')
  add(signals.repeatDefectsTrendUp, ESTATE_PENALTIES.repeatDefectsTrendUp, 'Repeat defects increasing across estate')
  add(signals.costExposure > THRESHOLDS.estateCostExposure, ESTATE_PENALTIES.costExposureOverThreshold, 'Cost exposure above threshold')
  add(signals.criticalTicketOverdue, ESTATE_PENALTIES.criticalTicketOverdue, 'Critical ticket overdue across estate')

  const finalEstateHealth = clamp(round(weightedRegionalHealth - penalty), 0, 100)
  const rag = ragForScore(finalEstateHealth) ?? 'critical'

  return {
    weightedRegionalHealth,
    riskPenalty: penalty,
    appliedPenalties: applied,
    finalEstateHealth,
    rag,
    totalActiveStores,
    counts,
    regionsCritical,
    pctCritical: round(pctCritical),
    pctRed: round(pctRed),
    openTickets: signals.openTickets,
    criticalTickets: signals.criticalTickets,
    quotesAwaitingApproval: signals.quotesAwaitingApproval,
    supplierSlaBreaches: signals.supplierSlaBreaches,
    internalSlaBreaches: signals.internalSlaBreaches,
    costExposure: signals.costExposure,
    mainRiskDriver: applied[0] ?? (rag === 'green' ? 'Estate well controlled' : 'Multiple regions need attention'),
  }
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)) }
function round(n: number) { return Math.round(n) }
