// MOTIV health engine v3 — Regional Portfolio Health (spec §10)
import type { HealthStatus } from './types'
import { REGIONAL_PENALTIES, statusForScore } from './constants'
import type { StoreHealthResult } from './storeHealth'

export interface StatusCounts { controlled: number; attention: number; at_risk: number; critical: number }
export interface RegionalSignals {
  criticalTicketOverdue: boolean
  supplierBreachOver3dCount: number
  internalBreachOver3dCount: number
  repeatAcrossStores: boolean
  highValueBlocker: boolean
  missingCriticalUpdates: boolean
  openTickets: number
  overdueTickets: number
  costExposure: number
}
export interface RegionalHealthResult {
  regionId: string
  averageStoreHealth: number
  riskPenalty: number
  appliedPenalties: string[]
  finalPortfolioHealth: number
  status: HealthStatus
  activeStores: number
  counts: StatusCounts
  openTickets: number
  overdueTickets: number
  supplierSlaBreaches: number
  internalSlaBreaches: number
  costExposure: number
  mainReason: string
}

export function tallyStatus(stores: StoreHealthResult[]): StatusCounts {
  const c: StatusCounts = { controlled: 0, attention: 0, at_risk: 0, critical: 0 }
  for (const s of stores) c[s.finalStatus]++
  return c
}

export function calculateRegionalPortfolioHealth(
  regionId: string, stores: StoreHealthResult[], sig: RegionalSignals,
): RegionalHealthResult {
  const activeStores = stores.length
  const averageStoreHealth = activeStores ? round(stores.reduce((s, x) => s + x.finalHealthScore, 0) / activeStores) : 100
  const counts = tallyStatus(stores)

  const applied: string[] = []
  let penalty = 0
  const add = (c: boolean, amt: number, label: string) => { if (c) { penalty += amt; applied.push(label) } }
  add(counts.critical > 0, REGIONAL_PENALTIES.anyCritical, `${counts.critical} critical store(s)`)
  add(counts.at_risk >= 3, REGIONAL_PENALTIES.threeOrMoreAtRisk, `${counts.at_risk} at-risk stores`)
  add(sig.criticalTicketOverdue, REGIONAL_PENALTIES.criticalTicketOverdue, 'Critical ticket overdue')
  add(sig.internalBreachOver3dCount > 0, REGIONAL_PENALTIES.internalBreachOver3d, `${sig.internalBreachOver3dCount} internal SLA breach >3d`)
  add(sig.supplierBreachOver3dCount > 0, REGIONAL_PENALTIES.supplierBreachOver3d, `${sig.supplierBreachOver3dCount} supplier SLA breach >3d`)
  add(sig.repeatAcrossStores, REGIONAL_PENALTIES.repeatAcrossStores, 'Repeat defects across stores')
  add(sig.highValueBlocker, REGIONAL_PENALTIES.highValueBlocker, 'High-value commercial blocker')
  add(sig.missingCriticalUpdates, REGIONAL_PENALTIES.missingCriticalUpdates, 'Missing updates on critical tickets')

  const finalPortfolioHealth = clamp(round(averageStoreHealth - penalty), 0, 100)
  return {
    regionId, averageStoreHealth, riskPenalty: penalty, appliedPenalties: applied,
    finalPortfolioHealth, status: statusForScore(finalPortfolioHealth),
    activeStores, counts, openTickets: sig.openTickets, overdueTickets: sig.overdueTickets,
    supplierSlaBreaches: sig.supplierBreachOver3dCount, internalSlaBreaches: sig.internalBreachOver3dCount,
    costExposure: sig.costExposure,
    mainReason: counts.critical > 0 ? `${counts.critical} critical store(s)` : applied[0] ?? (averageStoreHealth >= 85 ? 'Portfolio controlled' : 'Stores carrying open work'),
  }
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)) }
function round(n: number) { return Math.round(n) }
