// AI Morning Briefing — compact "facts" extracted from each role's assembled
// dashboard, plus a deterministic fallback used when the LLM is unavailable.
// Pure module (type-only imports), safe to use anywhere.
import type {
  StoreManagerData, RegionalDashboardData, SupplierDashboardData, EstateDashboardData,
} from '@/lib/health/data'

export type BriefingRole = 'store_manager' | 'regional_manager' | 'supplier' | 'executive'
export type BriefingScope = 'store' | 'region' | 'supplier' | 'estate'
export type BriefingFacts = Record<string, unknown>
export interface Briefing { headline: string | null; body: string; source: 'ai' | 'fallback' }

const r = (n: number) => `R${Math.round(n).toLocaleString('en-ZA')}`

// ── facts builders ──────────────────────────────────────────────
// Store managers must never see money/quotes — those keys are omitted here.
export function storeFacts(d: StoreManagerData): BriefingFacts {
  const h = d.health
  return {
    store: d.branch,
    openTickets: d.open, inProgress: d.inProgress, completedTickets: d.completed,
    overdueTickets: h?.overdueTickets ?? 0,
    safetyRiskOpen: h?.safetyOpen ?? 0,
    storeHealthScore: h?.finalHealthScore ?? null,
    storeHealthStatus: h?.finalStatus ?? null,
    mainIssue: h?.mainIssue ?? null,
  }
}

export function regionFacts(d: RegionalDashboardData): BriefingFacts {
  const p = d.portfolio
  return {
    portfolioHealthScore: p.finalPortfolioHealth, portfolioStatus: p.status,
    activeStores: p.activeStores, storesNeedingAttention: d.attentionStores.length,
    openTickets: p.openTickets, overdueTickets: p.overdueTickets,
    signoffsPending: d.signoffsPending, openSnags: d.snagsOpen,
    supplierSlaBreaches: p.supplierSlaBreaches, internalSlaBreaches: p.internalSlaBreaches,
    topAttentionStores: d.attentionStores.slice(0, 3).map(s => ({ name: s.storeName, health: s.finalHealthScore, issue: s.mainIssue })),
  }
}

export function supplierFacts(d: SupplierDashboardData): BriefingFacts {
  return {
    performanceScore: d.perf.performanceScore, performanceBand: d.perf.band,
    openWork: d.kpis.open, overdue: d.kpis.overdue, dueToday: d.kpis.dueToday,
    pendingQuotes: d.kpis.pendingQuotes, awaitingSignoff: d.kpis.awaitingSignoff,
    evidenceMissing: d.kpis.evidenceMissing, slaBreaches: d.perf.slaBreaches,
  }
}

export function estateFacts(d: EstateDashboardData): BriefingFacts {
  const e = d.estate
  return {
    stores: e.totalActiveStores, regions: d.totalRegions,
    estateHealthScore: e.finalEstateHealth, estateStatus: e.status, mainRiskDriver: e.mainRiskDriver,
    openWork: e.openTickets, supplierSlaBreaches: e.supplierSlaBreaches, internalSlaBreaches: e.internalSlaBreaches,
    pendingApprovals: e.decisionsPending, pendingApprovalValue: Math.round(d.pendingDecisionValue),
    costExposure: Math.round(e.costExposure), repeatDefects: d.repeatDefects.length,
    regionAlerts: d.regions.filter(x => x.region.status !== 'controlled').length,
    topRiskStores: d.topRiskStores.slice(0, 3).map(s => ({ name: s.storeName, health: s.finalHealthScore, issue: s.mainIssue })),
  }
}

// ── deterministic fallback (no LLM) ─────────────────────────────
const greet = (now: Date) => { const h = now.getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`

export function fallbackBriefing(role: BriefingRole, f: BriefingFacts, now: Date = new Date()): Briefing {
  const g = greet(now)
  if (role === 'store_manager') {
    const parts = [`${plural(Number(f.openTickets) || 0, 'ticket')} open, ${Number(f.inProgress) || 0} in progress, ${Number(f.completedTickets) || 0} completed.`]
    if (Number(f.safetyRiskOpen) > 0) parts.push(`${plural(Number(f.safetyRiskOpen), 'safety-risk ticket')} need priority.`)
    if (Number(f.overdueTickets) > 0) parts.push(`${plural(Number(f.overdueTickets), 'ticket')} past target — the team is following up.`)
    else parts.push('Nothing is overdue — your store is on track.')
    return { headline: 'Your store today', body: `${g}. ${parts.join(' ')}`, source: 'fallback' }
  }
  if (role === 'regional_manager') {
    const parts = [`Portfolio health ${f.portfolioHealthScore}% (${f.portfolioStatus}).`, `${plural(Number(f.storesNeedingAttention) || 0, 'store')} need attention.`]
    if (Number(f.signoffsPending) > 0) parts.push(`${plural(Number(f.signoffsPending), 'job')} awaiting your sign-off.`)
    if (Number(f.openSnags) > 0) parts.push(`${plural(Number(f.openSnags), 'open snag')} to resolve.`)
    return { headline: 'Regional snapshot', body: `${g}. ${parts.join(' ')}`, source: 'fallback' }
  }
  if (role === 'supplier') {
    const parts = [`Performance ${f.performanceScore}% (${f.performanceBand}).`, `${plural(Number(f.openWork) || 0, 'job')} open.`]
    if (Number(f.overdue) > 0) parts.push(`${plural(Number(f.overdue), 'job')} overdue.`)
    if (Number(f.evidenceMissing) > 0) parts.push(`${plural(Number(f.evidenceMissing), 'job')} missing evidence.`)
    return { headline: 'Your work today', body: `${g}. ${parts.join(' ')}`, source: 'fallback' }
  }
  const parts = [`Estate health ${f.estateHealthScore}% (${f.estateStatus}); main driver ${f.mainRiskDriver}.`, `${plural(Number(f.openWork) || 0, 'open job')} across ${plural(Number(f.regions) || 0, 'region')}.`]
  if (Number(f.pendingApprovals) > 0) parts.push(`${plural(Number(f.pendingApprovals), 'approval')} pending (${r(Number(f.pendingApprovalValue) || 0)}).`)
  if (Number(f.supplierSlaBreaches) > 0) parts.push(`${plural(Number(f.supplierSlaBreaches), 'supplier SLA breach')}.`)
  return { headline: 'Estate snapshot', body: `${g}. ${parts.join(' ')}`, source: 'fallback' }
}
