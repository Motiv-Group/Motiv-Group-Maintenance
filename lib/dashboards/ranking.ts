// ============================================================
// Dashboards v2 — getTopRiskStores + getRegionalRanking (spec §12.10, §12.11)
// ============================================================
import { RAG_RANK } from './constants'
import type { StoreHealthResult } from './storeHealth'
import type { RegionalHealthResult } from './regionalHealth'

/** A composite risk number — higher = needs attention sooner. */
export function storeRiskScore(s: StoreHealthResult): number {
  return (
    (100 - s.finalHealthScore) +
    s.safetyOpen * 20 +
    s.criticalOpen * 15 +
    s.tradingOpen * 10 +
    s.overdueTickets * 5 +
    s.pendingApprovals * 3 +
    s.repeatCount * 5 +
    Math.min(20, s.costExposure / 10_000)
  )
}

export interface RankedStore<T extends StoreHealthResult = StoreHealthResult> {
  rank: number
  risk: number
  store: T
}

export function getTopRiskStores<T extends StoreHealthResult>(stores: T[], limit = 10): RankedStore<T>[] {
  return stores
    .map(store => ({ store, risk: Math.round(storeRiskScore(store)) }))
    .sort((a, b) =>
      (RAG_RANK[b.store.finalRag] - RAG_RANK[a.store.finalRag]) ||
      (b.risk - a.risk),
    )
    .slice(0, limit)
    .map((x, i) => ({ rank: i + 1, ...x }))
}

export interface RankedRegion {
  rank: number
  region: RegionalHealthResult
}

/** Rank regions highest-risk → lowest-risk. */
export function getRegionalRanking(regions: RegionalHealthResult[]): RankedRegion[] {
  return [...regions]
    .sort((a, b) =>
      (RAG_RANK[b.rag] - RAG_RANK[a.rag]) ||
      (a.finalPortfolioHealth - b.finalPortfolioHealth) ||
      (b.counts.critical - a.counts.critical),
    )
    .map((region, i) => ({ rank: i + 1, region }))
}
