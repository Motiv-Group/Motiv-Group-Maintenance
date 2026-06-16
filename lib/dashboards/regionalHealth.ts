// ============================================================
// Dashboards v2 — calculateRegionalPortfolioHealth (spec §4, §12.3)
//
// Portfolio Health = Average Store Health − Portfolio Risk Penalty.
// The penalty stops many healthy stores from masking a few dangerous ones.
// ============================================================
import type { RagStatus } from '@/lib/types'
import { REGIONAL_PENALTIES, THRESHOLDS, ragForScore } from './constants'
import type { StoreHealthResult } from './storeHealth'

export interface RegionalSignals {
  criticalTicketOverdue: boolean
  supplierBreachOver3dCount: number
  internalBreachOver3dCount: number
  repeatDefectAcrossStores: boolean
  quoteApprovalBacklog: number
  missingCriticalUpdates: boolean
  openTickets: number
  overdueTickets: number
  costExposure: number
}

export interface RagCounts { green: number; amber: number; red: number; critical: number }

export interface RegionalHealthResult {
  regionId: string
  averageStoreHealth: number
  riskPenalty: number
  appliedPenalties: string[]
  finalPortfolioHealth: number
  rag: RagStatus
  activeStores: number
  counts: RagCounts
  openTickets: number
  overdueTickets: number
  supplierSlaBreaches: number
  internalSlaBreaches: number
  costExposure: number
  mainReason: string
}

export function tallyRag(stores: StoreHealthResult[]): RagCounts {
  const c: RagCounts = { green: 0, amber: 0, red: 0, critical: 0 }
  for (const s of stores) c[s.finalRag]++
  return c
}

export function calculateRegionalPortfolioHealth(
  regionId: string,
  stores: StoreHealthResult[],
  signals: RegionalSignals,
): RegionalHealthResult {
  const activeStores = stores.length
  const averageStoreHealth = activeStores > 0
    ? round(stores.reduce((s, x) => s + x.finalHealthScore, 0) / activeStores)
    : 100
  const counts = tallyRag(stores)

  const applied: string[] = []
  let penalty = 0
  const add = (cond: boolean, amt: number, label: string) => { if (cond) { penalty += amt; applied.push(label) } }

  add(counts.critical > 0, REGIONAL_PENALTIES.anyCriticalStore, `${counts.critical} critical store(s)`)
  add(counts.red >= 3, REGIONAL_PENALTIES.threeOrMoreRedStores, `${counts.red} red stores`)
  add(signals.criticalTicketOverdue, REGIONAL_PENALTIES.criticalTicketOverdue, 'Critical ticket overdue')
  add(signals.internalBreachOver3dCount > 0, REGIONAL_PENALTIES.internalSlaBreachOver3d, `${signals.internalBreachOver3dCount} internal SLA breach >3d`)
  add(signals.supplierBreachOver3dCount > 0, REGIONAL_PENALTIES.supplierSlaBreachOver3d, `${signals.supplierBreachOver3dCount} supplier SLA breach >3d`)
  add(signals.repeatDefectAcrossStores, REGIONAL_PENALTIES.repeatDefectAcrossStores, 'Repeat defects across stores')
  add(signals.quoteApprovalBacklog > THRESHOLDS.quoteBacklogCount, REGIONAL_PENALTIES.quoteApprovalBacklog, `${signals.quoteApprovalBacklog} quotes awaiting approval`)
  add(signals.missingCriticalUpdates, REGIONAL_PENALTIES.missingCriticalUpdates, 'Missing updates on critical tickets')

  const finalPortfolioHealth = clamp(round(averageStoreHealth - penalty), 0, 100)
  const rag = ragForScore(finalPortfolioHealth) ?? 'critical'

  return {
    regionId,
    averageStoreHealth,
    riskPenalty: penalty,
    appliedPenalties: applied,
    finalPortfolioHealth,
    rag,
    activeStores,
    counts,
    openTickets: signals.openTickets,
    overdueTickets: signals.overdueTickets,
    supplierSlaBreaches: signals.supplierBreachOver3dCount,
    internalSlaBreaches: signals.internalBreachOver3dCount,
    costExposure: signals.costExposure,
    mainReason: deriveReason(counts, applied, averageStoreHealth),
  }
}

function deriveReason(counts: RagCounts, applied: string[], avg: number): string {
  if (counts.critical > 0) return `${counts.critical} critical store(s) require immediate intervention`
  if (applied.length > 0) return applied.slice(0, 2).join(' · ')
  if (avg >= 85) return 'Portfolio is well controlled'
  return 'Several stores carrying open work — follow up the flagged stores'
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)) }
function round(n: number) { return Math.round(n) }
