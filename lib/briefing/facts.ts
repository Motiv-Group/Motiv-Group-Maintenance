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

/** Render a briefing as a WhatsApp message (bold headline + body + sign-off). */
export function briefingToText(b: Briefing): string {
  return `${b.headline ? `*${b.headline}*\n\n` : ''}${b.body}\n\n— Motiv briefing`
}

// ── facts builders ──────────────────────────────────────────────
// Store managers must never see money/quotes — those keys are omitted here.
export function storeFacts(d: StoreManagerData): BriefingFacts {
  const h = d.health
  return {
    store: d.branch,
    openTickets: d.open, inProgress: d.inProgress, completedTickets: d.completed,
    // Same basis as the Overdue KPI / filter / per-ticket red indicator (past the
    // resolution deadline) so the briefing count and the dashboard always agree.
    overdueTickets: d.tickets.filter(t => t.overdue).length,
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
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`
// Status/band enums are snake_case internals ('at_risk') — never show them raw
// in user-facing copy.
const human = (s: unknown) => String(s ?? '').replace(/_/g, ' ')

// The briefing body must NOT start with a greeting: the dashboard hero already
// greets the user, and AiBriefing shows the body's FIRST SENTENCE as the inline
// "condensed" line — a leading "Good afternoon." would make that line say nothing.
// So the first sentence of every body is the single most useful headline fact.
export function fallbackBriefing(role: BriefingRole, f: BriefingFacts, now: Date = new Date()): Briefing {
  if (role === 'store_manager') {
    const parts = [`${plural(Number(f.openTickets) || 0, 'ticket')} open, ${Number(f.inProgress) || 0} in progress, ${Number(f.completedTickets) || 0} completed.`]
    if (Number(f.safetyRiskOpen) > 0) parts.push(`${plural(Number(f.safetyRiskOpen), 'safety-risk ticket')} need priority.`)
    if (Number(f.overdueTickets) > 0) parts.push(`${plural(Number(f.overdueTickets), 'ticket')} past target and not yet actioned — follow up with your Regional Manager for an update.`)
    else parts.push('Nothing is overdue — your store is on track.')
    return { headline: 'Your store today', body: parts.join(' '), source: 'fallback' }
  }
  if (role === 'regional_manager') {
    const attention = Number(f.storesNeedingAttention) || 0
    const stores = Number(f.activeStores) || 0
    // Lead sentence = the condensed overview shown inline; the rest elaborates it
    // in the "View insight" pop-up.
    const parts = [`Portfolio health is ${f.portfolioHealthScore}% (${human(f.portfolioStatus)}) across ${plural(stores, 'active store')}.`]
    if (attention > 0) {
      // Built by regionFacts as {name, health, issue} rows (BriefingFacts erases the shape).
      const top = Array.isArray(f.topAttentionStores) ? (f.topAttentionStores as { name?: unknown; health?: unknown }[]) : []
      const named = top.length ? ` — led by ${top.map(s => `${s.name} (${Math.round(Number(s.health))}%)`).join(', ')}` : ''
      parts.push(`${plural(attention, 'store')} need attention${named}.`)
    } else {
      parts.push('Every store is under control.')
    }
    if (Number(f.overdueTickets) > 0) parts.push(`${plural(Number(f.overdueTickets), 'ticket')} overdue of ${Number(f.openTickets) || 0} open.`)
    const breaches = (Number(f.supplierSlaBreaches) || 0) + (Number(f.internalSlaBreaches) || 0)
    if (breaches > 0) parts.push(`${plural(breaches, 'SLA breach')} to chase.`)
    if (Number(f.signoffsPending) > 0) parts.push(`${plural(Number(f.signoffsPending), 'job')} awaiting your sign-off.`)
    if (Number(f.openSnags) > 0) parts.push(`${plural(Number(f.openSnags), 'open snag')} to resolve.`)
    const headline = attention > 0 ? `${plural(attention, 'store')} need attention` : 'Portfolio under control'
    return { headline, body: parts.join(' '), source: 'fallback' }
  }
  if (role === 'supplier') {
    const parts = [`Performance ${f.performanceScore}% (${human(f.performanceBand)}).`, `${plural(Number(f.openWork) || 0, 'job')} open.`]
    if (Number(f.overdue) > 0) parts.push(`${plural(Number(f.overdue), 'job')} overdue.`)
    if (Number(f.evidenceMissing) > 0) parts.push(`${plural(Number(f.evidenceMissing), 'job')} missing evidence.`)
    return { headline: 'Your work today', body: parts.join(' '), source: 'fallback' }
  }
  const parts = [`Estate health ${f.estateHealthScore}% (${human(f.estateStatus)}); main driver ${f.mainRiskDriver}.`, `${plural(Number(f.openWork) || 0, 'open job')} across ${plural(Number(f.regions) || 0, 'region')}.`]
  if (Number(f.pendingApprovals) > 0) parts.push(`${plural(Number(f.pendingApprovals), 'approval')} pending (${r(Number(f.pendingApprovalValue) || 0)}).`)
  if (Number(f.supplierSlaBreaches) > 0) parts.push(`${plural(Number(f.supplierSlaBreaches), 'supplier SLA breach')}.`)
  return { headline: 'Estate snapshot', body: parts.join(' '), source: 'fallback' }
}
