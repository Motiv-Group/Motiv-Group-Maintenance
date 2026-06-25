// ============================================================
// MOTIV health engine v3 — executive data model (server-only)
// Loads company-scoped rows via the service-role client and runs the engine.
// Reads the v3 schema (companies/regions/stores/tickets/sla_rules/...).
// SERVER ONLY.
// ============================================================
import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import type { HealthTicket, Priority, SlaTargets, SlaRuleResolver } from './types'
import { isActive } from './types'
import { FALLBACK_SLA } from './constants'
import { calculateStoreHealth, type StoreHealthResult, type StoreInput } from './storeHealth'
import { calculateTicketHealth } from './ticketHealth'
import { calculateRegionalPortfolioHealth, type RegionalHealthResult, type RegionalSignals } from './regionalHealth'
import { calculateEstateHealth, type EstateHealthResult } from './estateHealth'
import { calculateSupplierPerformance, type SupplierPerformance } from './supplierPerformance'
import { detectRepeatDefects, type RepeatDefect } from './repeatDefects'
import { getExecutiveDecisionItems, type DecisionItem } from './decisions'
import { computeTicketSla, supplierBreachOlderThan, internalBreachOlderThan } from './sla'
import { clientVisibleStatus, storeLabel } from '@/lib/utils'
import type { TicketStatus } from '@/lib/types'

type DB = ReturnType<typeof createAdminClient>
const DAY = 24 * 3600_000
const HIGH_VALUE = 25_000

// ── SLA resolver: company row → platform default row → hardcoded fallback ──
export async function loadSlaResolver(db: DB, companyId: string): Promise<SlaRuleResolver> {
  const { data } = await db.from('sla_rules').select('*').or(`company_id.eq.${companyId},company_id.is.null`)
  const rows = (data ?? []) as any[]
  const pick = (p: Priority): SlaTargets => {
    const company = rows.find(r => r.company_id === companyId && r.priority === p)
    const global = rows.find(r => r.company_id === null && r.priority === p)
    const r = company ?? global
    return r ? {
      priority: p, first_response_mins: r.first_response_mins, attendance_mins: r.attendance_mins,
      quote_due_mins: r.quote_due_mins, resolution_mins: r.resolution_mins, internal_decision_mins: r.internal_decision_mins,
    } : FALLBACK_SLA[p]
  }
  const cache = { P1: pick('P1'), P2: pick('P2'), P3: pick('P3'), P4: pick('P4') }
  return (p: Priority) => cache[p] ?? FALLBACK_SLA[p]
}

const TICKET_COLS = '*'
function asTicket(r: any): HealthTicket { return r as HealthTicket }

// ── regional signal computation from a region's tickets ──
function regionSignals(tickets: HealthTicket[], rules: SlaRuleResolver, now: Date): RegionalSignals {
  const active = tickets.filter(t => isActive(t.status))
  let criticalTicketOverdue = false, supplierBreachOver3dCount = 0, internalBreachOver3dCount = 0
  let highValueBlocker = false, missingCriticalUpdates = false, overdue = 0, cost = 0
  for (const t of active) {
    const s = rules(t.priority)
    const sla = computeTicketSla(t, s, now)
    if (sla.supplierBreached || sla.internalBreached) overdue++
    if (t.priority === 'P1' && (sla.supplierBreached || sla.internalBreached)) criticalTicketOverdue = true
    if (supplierBreachOlderThan(t, s, 3, now)) supplierBreachOver3dCount++
    if (internalBreachOlderThan(t, s, 3, now)) internalBreachOver3dCount++
    if (sla.currentBlocker === 'quote_approval' && (t.quote_value ?? 0) >= HIGH_VALUE) highValueBlocker = true
    if (t.priority === 'P1') {
      const ref = t.last_supplier_update_at ?? t.last_internal_update_at ?? t.updated_at
      if (now.getTime() - new Date(ref).getTime() > 48 * 3600_000) missingCriticalUpdates = true
    }
    cost += t.quote_value ?? 0
  }
  const repeats = detectRepeatDefects(tickets, 30, now)
  const repeatAcrossStores = new Set(repeats.map(r => r.storeId)).size >= 2
  return {
    criticalTicketOverdue, supplierBreachOver3dCount, internalBreachOver3dCount, repeatAcrossStores,
    highValueBlocker, missingCriticalUpdates, openTickets: active.length, overdueTickets: overdue, costExposure: cost,
  }
}

export interface StoreManagerContact { name: string | null; email: string | null; phone: string | null }
export interface StoreCard extends StoreHealthResult { storeName: string; regionName: string; sm?: StoreManagerContact | null }
export interface TrendDelta { dir: 'up' | 'down' | 'flat'; pct: number }
export interface EstateTrends { openWork: TrendDelta; slaPressure: TrendDelta; cost: TrendDelta; supplierBreaches: TrendDelta }
export interface ExposureBucket { label: string; value: number }
export interface SupplierEscalationRow {
  id: string; supplierId: string; supplierName: string; issue: string
  actionRequired: string | null; status: string; escalatedBy: string | null; escalatedAt: string
}
export interface SeriesPoint { label: string; value: number }
export interface EstateDashboardData {
  trends: EstateTrends
  estate: EstateHealthResult
  totalRegions: number
  regions: { rank: number; region: RegionalHealthResult; regionName: string; trend: TrendDelta }[]
  stores: StoreCard[]
  topRiskStores: StoreCard[]
  attentionStores: StoreCard[]
  controlledStores: StoreCard[]
  storeTrends: Record<string, TrendDelta>
  suppliers: { id: string; name: string; perf: SupplierPerformance; open: number; overdue: number; costExposure: number; trend: TrendDelta }[]
  supplierSlaSeries: SeriesPoint[]
  escalations: SupplierEscalationRow[]
  repeatDefects: (RepeatDefect & { storeName: string; regionName: string })[]
  decisions: DecisionItem[]
  pendingDecisionValue: number
  highValueApprovals: { count: number; value: number }
  exposureBreakdown: ExposureBucket[]
  generatedAt: string
}

export async function assembleEstateDashboard(companyId: string, now: Date = new Date()): Promise<EstateDashboardData> {
  const db = createAdminClient()
  const rules = await loadSlaResolver(db, companyId)

  const [{ data: regionsRaw }, { data: storesRaw }, { data: ticketsRaw }, { data: suppliersRaw }] = await Promise.all([
    db.from('regions').select('id, name').eq('company_id', companyId).eq('active', true),
    db.from('stores').select('id, name, sub_store, region_id').eq('company_id', companyId).eq('active', true).is('closed_at', null),
    db.from('tickets').select(TICKET_COLS).eq('company_id', companyId),
    db.from('suppliers').select('id, company_name').eq('company_id', companyId),
  ])

  const regionName = new Map((regionsRaw ?? []).map((r: any) => [r.id, r.name]))
  const stores = (storesRaw ?? []) as any[]
  const storeName = new Map(stores.map(s => [s.id, [s.name, s.sub_store].filter(Boolean).join(' — ')]))
  const tickets = ((ticketsRaw ?? []) as any[]).map(asTicket)
  const supplierName = new Map((suppliersRaw ?? []).map((s: any) => [s.id, s.company_name]))

  // trend baselines + escalations (snapshots written by the daily crons)
  const [supplierPrev, storePrev, supplierSlaSeries, escalations] = await Promise.all([
    loadSupplierPrevScore(db, companyId, now),
    loadStorePrevHealth(db, companyId, now),
    loadSupplierSlaSeries(db, companyId, now),
    loadEscalations(db, companyId, supplierName),
  ])

  const ticketsByStore = new Map<string, HealthTicket[]>()
  for (const t of tickets) { const a = ticketsByStore.get(t.store_id) ?? []; a.push(t); ticketsByStore.set(t.store_id, a) }

  // store health
  const cards: StoreCard[] = stores.map(s => {
    const res = calculateStoreHealth({ id: s.id, region_id: s.region_id } as StoreInput, ticketsByStore.get(s.id) ?? [], rules, now)
    return { ...res, storeName: storeName.get(s.id) ?? 'Store', regionName: regionName.get(s.region_id) ?? '—' }
  })

  // regional rollup
  const cardsByRegion = new Map<string, StoreCard[]>()
  const ticketsByRegion = new Map<string, HealthTicket[]>()
  for (const c of cards) { const k = c.regionId ?? 'none'; const a = cardsByRegion.get(k) ?? []; a.push(c); cardsByRegion.set(k, a) }
  for (const t of tickets) { const k = t.region_id ?? 'none'; const a = ticketsByRegion.get(k) ?? []; a.push(t); ticketsByRegion.set(k, a) }

  const regionResults: RegionalHealthResult[] = []
  for (const [rid, rc] of cardsByRegion) {
    if (rid === 'none') continue
    regionResults.push(calculateRegionalPortfolioHealth(rid, rc, regionSignals(ticketsByRegion.get(rid) ?? [], rules, now)))
  }

  // estate
  const active = tickets.filter(t => isActive(t.status))
  let supplierSlaBreaches = 0, internalSlaBreaches = 0, decisionsPending = 0, criticalOverdue = false
  for (const t of active) {
    const sla = computeTicketSla(t, rules(t.priority), now)
    if (sla.supplierBreached) supplierSlaBreaches++
    if (sla.internalBreached) internalSlaBreaches++
    if (sla.currentBlocker === 'quote_approval') decisionsPending++
    if (t.priority === 'P1' && (sla.supplierBreached || sla.internalBreached)) criticalOverdue = true
  }
  const pendingDecisionValue = active.filter(t => computeTicketSla(t, rules(t.priority), now).currentBlocker === 'quote_approval')
    .reduce((s, t) => s + (t.quote_value ?? 0), 0)

  const estate = calculateEstateHealth(regionResults, {
    supplierTrendUp: false, internalTrendUp: false, commercialBacklogUp: false, repeatTrendUp: false,
    criticalTicketOverdue: criticalOverdue, costExposure: pendingDecisionValue,
    openTickets: active.length, criticalTickets: active.filter(t => t.priority === 'P1').length,
    decisionsPending, supplierSlaBreaches, internalSlaBreaches,
  })

  // per-region trend vs yesterday's snapshot (flat when no snapshot exists yet)
  const regionPrev = await loadRegionPrevHealth(db, companyId, now)
  const ranking = [...regionResults]
    .sort((a, b) => (rank(b) - rank(a)) || (a.finalPortfolioHealth - b.finalPortfolioHealth))
    .map((region, i) => ({
      rank: i + 1, region, regionName: regionName.get(region.regionId) ?? 'Region',
      trend: delta(region.finalPortfolioHealth, regionPrev.get(region.regionId)),
    }))

  const topRiskStores = [...cards].sort((a, b) => storeRisk(b) - storeRisk(a)).slice(0, 10)
  const attentionStores = cards.filter(c => c.finalStatus === 'attention').sort((a, b) => a.finalHealthScore - b.finalHealthScore)
  const controlledStores = cards.filter(c => c.finalStatus === 'controlled').sort((a, b) => b.finalHealthScore - a.finalHealthScore)

  const bySupplier = new Map<string, HealthTicket[]>()
  for (const t of tickets) if (t.supplier_id) { const a = bySupplier.get(t.supplier_id) ?? []; a.push(t); bySupplier.set(t.supplier_id, a) }
  const suppliers = [...bySupplier.entries()]
    .map(([id, ts]) => {
      const act = ts.filter(t => isActive(t.status))
      const overdue = act.filter(t => { const s = computeTicketSla(t, rules(t.priority), now); return s.supplierBreached || s.internalBreached }).length
      const costExposure = act.reduce((s, t) => s + (t.quote_value ?? 0), 0)
      const perf = calculateSupplierPerformance(id, ts, rules, now)
      return { id, name: supplierName.get(id) ?? 'Supplier', perf, open: act.length, overdue, costExposure, trend: delta(perf.performanceScore, supplierPrev.get(id)) }
    })
    .sort((a, b) => a.perf.performanceScore - b.perf.performanceScore)

  const repeatDefects = detectRepeatDefects(tickets, 30, now)
    .map(d => ({ ...d, storeName: storeName.get(d.storeId) ?? 'Store', regionName: regionName.get(d.regionId ?? '') ?? '—' }))

  const highValueDecisions = active
    .filter(t => computeTicketSla(t, rules(t.priority), now).currentBlocker === 'quote_approval')
    .map(t => ({ ticketId: t.id, storeName: storeName.get(t.store_id) ?? 'Store', value: t.quote_value ?? 0, daysWaiting: computeTicketSla(t, rules(t.priority), now).daysWithBlocker ?? 0 }))
    .filter(a => a.value >= HIGH_VALUE).sort((a, b) => b.value - a.value)

  const highValueApprovals = {
    count: highValueDecisions.length,
    value: highValueDecisions.reduce((s, a) => s + a.value, 0),
  }

  // real exposure buckets from active commercial work (top 3 non-zero)
  const sumBy = (pred: (t: HealthTicket) => boolean) =>
    active.filter(pred).reduce((s, t) => s + (t.quote_value ?? 0), 0)
  const exposureBreakdown: ExposureBucket[] = [
    { label: 'Supplier SLA breaches', value: sumBy(t => computeTicketSla(t, rules(t.priority), now).supplierBreached) },
    { label: 'Repeat-defect rework', value: sumBy(t => !!t.repeat_defect_flag) },
    { label: 'Emergency / P1 work', value: sumBy(t => t.priority === 'P1') },
  ].filter(b => b.value > 0).sort((a, b) => b.value - a.value)

  const decisions = getExecutiveDecisionItems({
    topRiskStores: topRiskStores.map(s => ({ store: s, name: s.storeName })),
    regions: regionResults.map(r => ({ region: r, name: regionName.get(r.regionId) ?? 'Region' })),
    suppliers, highValueDecisions,
    repeatDefects: repeatDefects.map(d => ({ defect: d, storeName: d.storeName })),
  })

  const trends = await loadEstateTrends(db, companyId, {
    openWork: estate.openTickets,
    slaPressure: estate.supplierSlaBreaches + estate.internalSlaBreaches,
    cost: estate.costExposure,
    supplierBreaches: estate.supplierSlaBreaches,
  }, now)

  const storeTrends: Record<string, TrendDelta> = {}
  for (const c of cards) storeTrends[c.storeId] = delta(c.finalHealthScore, storePrev.get(c.storeId))

  return {
    trends, estate, totalRegions: (regionsRaw ?? []).length, regions: ranking,
    stores: cards, topRiskStores, attentionStores, controlledStores, storeTrends,
    suppliers, supplierSlaSeries, escalations, repeatDefects,
    decisions, pendingDecisionValue, highValueApprovals, exposureBreakdown, generatedAt: now.toISOString(),
  }
}

function delta(cur: number, prev: number | null | undefined): TrendDelta {
  if (prev == null || prev === 0) return { dir: 'flat', pct: 0 }
  const pct = Math.round(((cur - prev) / prev) * 100)
  return { dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat', pct: Math.abs(pct) }
}

async function loadEstateTrends(
  db: DB, companyId: string, cur: { openWork: number; slaPressure: number; cost: number; supplierBreaches: number }, now: Date,
): Promise<EstateTrends> {
  const yesterday = new Date(now.getTime() - DAY).toISOString().slice(0, 10)
  const { data } = await db.from('estate_health_scores').select('*').eq('company_id', companyId).eq('snapshot_date', yesterday).maybeSingle()
  const p: any = data ?? null
  return {
    openWork: delta(cur.openWork, p?.open_tickets),
    slaPressure: delta(cur.slaPressure, p ? (p.supplier_sla_breaches ?? 0) + (p.internal_sla_breaches ?? 0) : null),
    cost: delta(cur.cost, p?.cost_exposure),
    supplierBreaches: delta(cur.supplierBreaches, p?.supplier_sla_breaches),
  }
}

// Map supplier_id → yesterday's performance_score (supplier trend arrows).
async function loadSupplierPrevScore(db: DB, companyId: string, now: Date): Promise<Map<string, number>> {
  const yesterday = new Date(now.getTime() - DAY).toISOString().slice(0, 10)
  const { data } = await db.from('supplier_performance_scores')
    .select('supplier_id, performance_score').eq('company_id', companyId).eq('snapshot_date', yesterday)
  const m = new Map<string, number>()
  for (const r of (data ?? []) as any[]) if (r.supplier_id != null && r.performance_score != null) m.set(r.supplier_id, Number(r.performance_score))
  return m
}

// Map store_id → yesterday's final_health_score (store trend arrows).
async function loadStorePrevHealth(db: DB, companyId: string, now: Date): Promise<Map<string, number>> {
  const yesterday = new Date(now.getTime() - DAY).toISOString().slice(0, 10)
  const { data } = await db.from('store_health_scores')
    .select('store_id, final_health_score').eq('company_id', companyId).eq('snapshot_date', yesterday)
  const m = new Map<string, number>()
  for (const r of (data ?? []) as any[]) if (r.store_id != null && r.final_health_score != null) m.set(r.store_id, Number(r.final_health_score))
  return m
}

// Overall supplier SLA % per day for the last ~6 snapshot dates (SLA-trend sparkline).
async function loadSupplierSlaSeries(db: DB, companyId: string, now: Date): Promise<{ label: string; value: number }[]> {
  const from = new Date(now.getTime() - 42 * DAY).toISOString().slice(0, 10)
  const { data } = await db.from('supplier_performance_scores')
    .select('snapshot_date, performance_score').eq('company_id', companyId).gte('snapshot_date', from)
    .order('snapshot_date', { ascending: true })
  const byDate = new Map<string, number[]>()
  for (const r of (data ?? []) as any[]) {
    if (r.performance_score == null) continue
    const arr = byDate.get(r.snapshot_date) ?? []; arr.push(Number(r.performance_score)); byDate.set(r.snapshot_date, arr)
  }
  const dates = [...byDate.keys()].sort().slice(-6)
  return dates.map(d => {
    const xs = byDate.get(d)!
    return { label: new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }), value: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) }
  })
}

// Recent supplier escalations joined with supplier name.
async function loadEscalations(db: DB, companyId: string, supplierName: Map<string, string>): Promise<SupplierEscalationRow[]> {
  const { data } = await db.from('supplier_escalations')
    .select('id, supplier_id, issue, action_required, status, escalated_by, escalated_at')
    .eq('company_id', companyId).order('escalated_at', { ascending: false }).limit(20)
  return ((data ?? []) as any[]).map(r => ({
    id: r.id, supplierId: r.supplier_id, supplierName: supplierName.get(r.supplier_id) ?? 'Supplier',
    issue: r.issue, actionRequired: r.action_required ?? null, status: r.status,
    escalatedBy: r.escalated_by ?? null, escalatedAt: r.escalated_at,
  }))
}

// Map region_id → yesterday's final_portfolio_health (for per-region trend arrows).
async function loadRegionPrevHealth(db: DB, companyId: string, now: Date): Promise<Map<string, number>> {
  const yesterday = new Date(now.getTime() - DAY).toISOString().slice(0, 10)
  const { data } = await db.from('regional_health_scores')
    .select('region_id, final_portfolio_health').eq('company_id', companyId).eq('snapshot_date', yesterday)
  const m = new Map<string, number>()
  for (const r of (data ?? []) as any[]) if (r.region_id != null && r.final_portfolio_health != null) m.set(r.region_id, Number(r.final_portfolio_health))
  return m
}

// ============================================================
// REGIONAL DASHBOARD (scoped to a regional manager's regions)
// ============================================================
export interface RegionalTicketAction {
  id: string; storeName: string; priority: Priority; ageDays: number
  slaLabel: string; currentBlocker: string | null; nextAction: string; nextActionDueAt: string | null; healthScore: number
}
// Simple ticket row for the RM recent-tickets card + tickets tab (SM-style).
export interface RegionalTicketRow {
  id: string; title: string; storeName: string; branchCode: string | null
  status: string; priority: Priority; jobRef: string | null; createdAt: string
  quoteRequestedAt: string | null; quoteReceivedAt: string | null; quoteAcceptedAt: string | null; breached: boolean
}
export interface RegionalDashboardData {
  portfolio: RegionalHealthResult
  stores: StoreCard[]
  attentionStores: StoreCard[]
  ticketActions: RegionalTicketAction[]
  tickets: RegionalTicketRow[]
  suppliers: { id: string; name: string; perf: SupplierPerformance; open: number; overdue: number; costExposure: number; avgRating: number; ratingCount: number }[]
  signoffsPending: number
  snagsOpen: number
  generatedAt: string
}

export async function assembleRegionalDashboard(companyId: string, regionIds: string[], now: Date = new Date()): Promise<RegionalDashboardData> {
  const db = createAdminClient()
  const rules = await loadSlaResolver(db, companyId)
  const empty = (): RegionalDashboardData => ({
    portfolio: calculateRegionalPortfolioHealth('portfolio', [], { criticalTicketOverdue: false, supplierBreachOver3dCount: 0, internalBreachOver3dCount: 0, repeatAcrossStores: false, highValueBlocker: false, missingCriticalUpdates: false, openTickets: 0, overdueTickets: 0, costExposure: 0 }),
    stores: [], attentionStores: [], ticketActions: [], tickets: [], suppliers: [], signoffsPending: 0, snagsOpen: 0, generatedAt: now.toISOString(),
  })
  if (!regionIds.length) return empty()

  const [{ data: regionsRaw }, { data: storesRaw }, { data: ticketsRaw }, { data: suppliersRaw }] = await Promise.all([
    db.from('regions').select('id, name').in('id', regionIds),
    db.from('stores').select('id, name, sub_store, branch_code, region_id').eq('company_id', companyId).in('region_id', regionIds).eq('active', true).is('closed_at', null),
    db.from('tickets').select(TICKET_COLS).eq('company_id', companyId).in('region_id', regionIds),
    db.from('suppliers').select('id, company_name').eq('company_id', companyId),
  ])
  const regionName = new Map((regionsRaw ?? []).map((r: any) => [r.id, r.name]))
  const stores = (storesRaw ?? []) as any[]
  const storeIds = stores.map(s => s.id)
  const storeName = new Map(stores.map(s => [s.id, storeLabel(s.name, s.sub_store)]))
  const storeBranch = new Map(stores.map(s => [s.id, s.branch_code ?? null]))
  const tickets = ((ticketsRaw ?? []) as any[]).map(asTicket)
  const supplierName = new Map((suppliersRaw ?? []).map((s: any) => [s.id, s.company_name]))

  // Quote milestones per ticket: first quote received + when one was accepted.
  const ticketIds = tickets.map(t => t.id)
  const { data: quoteRows } = ticketIds.length ? await db.from('quotes').select('ticket_id, status, created_at').in('ticket_id', ticketIds) : { data: [] as any[] }
  const firstQuoteAt = new Map<string, string>(); const acceptedQuoteAt = new Map<string, string>()
  for (const q of (quoteRows ?? []) as any[]) {
    const cur = firstQuoteAt.get(q.ticket_id)
    if (!cur || new Date(q.created_at) < new Date(cur)) firstQuoteAt.set(q.ticket_id, q.created_at)
    if (q.status === 'accepted') acceptedQuoteAt.set(q.ticket_id, q.created_at)
  }

  // Ticket rows (most-recent first) for the recent card + tickets tab.
  const ticketRows: RegionalTicketRow[] = [...tickets]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .map(t => ({
      id: t.id, title: t.title ?? 'Untitled',
      storeName: storeName.get(t.store_id) ?? 'Store', branchCode: storeBranch.get(t.store_id) ?? null,
      status: t.status, priority: t.priority, jobRef: (t as any).job_ref ?? null, createdAt: t.created_at,
      quoteRequestedAt: (t as any).quote_requested_at ?? null,
      quoteReceivedAt: firstQuoteAt.get(t.id) ?? null,
      quoteAcceptedAt: ((t as any).quote_decision_status === 'approved' ? (t as any).quote_decided_at : null) ?? acceptedQuoteAt.get(t.id) ?? null,
      breached: isActive(t.status) ? (() => { const s = computeTicketSla(t, rules(t.priority), now); return s.supplierBreached || s.internalBreached })() : false,
    }))

  const byStore = new Map<string, HealthTicket[]>()
  for (const t of tickets) { const a = byStore.get(t.store_id) ?? []; a.push(t); byStore.set(t.store_id, a) }

  // SM contact per store — derived from the most recent store_manager who logged a
  // ticket there (no canonical store→manager link exists in the schema).
  const creatorIds = Array.from(new Set(tickets.map(t => (t as any).created_by).filter(Boolean)))
  const { data: profRows } = creatorIds.length
    ? await db.from('user_profiles').select('id, full_name, email, phone, role').in('id', creatorIds)
    : { data: [] as any[] }
  const smProfile = new Map<string, StoreManagerContact>()
  for (const p of (profRows ?? []) as any[]) if (p.role === 'store_manager') smProfile.set(p.id, { name: p.full_name ?? null, email: p.email ?? null, phone: p.phone ?? null })
  const storeSm = new Map<string, StoreManagerContact>()
  for (const t of [...tickets].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))) {
    if (storeSm.has(t.store_id)) continue
    const sm = smProfile.get((t as any).created_by)
    if (sm) storeSm.set(t.store_id, sm)
  }

  const cards: StoreCard[] = stores.map(s => {
    const res = calculateStoreHealth({ id: s.id, region_id: s.region_id }, byStore.get(s.id) ?? [], rules, now)
    return { ...res, storeName: storeName.get(s.id) ?? 'Store', regionName: regionName.get(s.region_id) ?? '—', sm: storeSm.get(s.id) ?? null }
  })
  const portfolio = calculateRegionalPortfolioHealth('portfolio', cards, regionSignals(tickets, rules, now))

  const ticketActions: RegionalTicketAction[] = tickets.filter(t => isActive(t.status)).map(t => {
    const h = calculateTicketHealth(t, rules(t.priority), now)
    const lbl = h.sla.currentBlocker === 'quote_approval' ? 'Awaiting approval'
      : h.sla.currentBlocker === 'store_access' ? 'Store access'
      : h.sla.currentBlocker === 'completion_signoff' ? 'Awaiting sign-off'
      : h.sla.supplierBreached ? 'Breached' : h.sla.atRisk ? 'At risk' : 'Healthy'
    return { id: t.id, storeName: storeName.get(t.store_id) ?? 'Store', priority: t.priority,
      ageDays: Math.floor((now.getTime() - new Date(t.created_at).getTime()) / DAY),
      slaLabel: lbl, currentBlocker: h.sla.currentBlocker, nextAction: h.sla.nextAction, nextActionDueAt: h.sla.nextActionDueAt, healthScore: h.score }
  }).sort((a, b) => a.healthScore - b.healthScore)

  const bySupplier = new Map<string, HealthTicket[]>()
  for (const t of tickets) if (t.supplier_id) { const a = bySupplier.get(t.supplier_id) ?? []; a.push(t); bySupplier.set(t.supplier_id, a) }
  // Avg star rating per supplier (company-wide).
  const { data: ratingRows } = await db.from('ratings').select('supplier_id, score').eq('company_id', companyId)
  const ratingAgg = new Map<string, { sum: number; n: number }>()
  for (const r of (ratingRows ?? []) as any[]) {
    if (!r.supplier_id || r.score == null) continue
    const a = ratingAgg.get(r.supplier_id) ?? { sum: 0, n: 0 }; a.sum += Number(r.score); a.n++; ratingAgg.set(r.supplier_id, a)
  }
  const suppliers = [...bySupplier.entries()].map(([id, ts]) => {
    const act = ts.filter(t => isActive(t.status))
    const overdue = act.filter(t => { const s = computeTicketSla(t, rules(t.priority), now); return s.supplierBreached || s.internalBreached }).length
    const ra = ratingAgg.get(id)
    return { id, name: supplierName.get(id) ?? 'Supplier', perf: calculateSupplierPerformance(id, ts, rules, now), open: act.length, overdue, costExposure: act.reduce((s, t) => s + (t.quote_value ?? 0), 0), avgRating: ra ? ra.sum / ra.n : 0, ratingCount: ra ? ra.n : 0 }
  }).sort((a, b) => a.perf.performanceScore - b.perf.performanceScore)

  let signoffsPending = 0, snagsOpen = 0
  if (storeIds.length) {
    const [{ count: sc }, { count: nc }] = await Promise.all([
      db.from('signoffs').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'awaiting_regional', 'awaiting_store']).in('ticket_id', tickets.map(t => t.id).length ? tickets.map(t => t.id) : ['00000000-0000-0000-0000-000000000000']),
      db.from('snags').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('store_id', storeIds).in('status', ['open', 'in_progress']),
    ])
    signoffsPending = sc ?? 0
    snagsOpen = nc ?? 0
  }

  const attentionStores = [...cards].filter(c => c.finalStatus !== 'controlled').sort((a, b) => a.finalHealthScore - b.finalHealthScore)
  return { portfolio, stores: cards, attentionStores, ticketActions, tickets: ticketRows, suppliers, signoffsPending, snagsOpen, generatedAt: now.toISOString() }
}

// ============================================================
// STORE MANAGER DASHBOARD (simplified, own store only)
// ============================================================
export type ClientStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'
// Single source of truth for the SM/client Open → In Progress → Completed
// collapse lives in lib/utils (clientVisibleStatus). Re-use it here so the
// dashboard counts and the ticket-detail badge can never disagree (previously
// this mapped everything-not-open → in_progress, which is why an assigned/quoted
// ticket read "Open" on the detail page but "In Progress" on the dashboard).
const clientVisible = (status: string): ClientStatus | null =>
  clientVisibleStatus(status as TicketStatus)
export interface StoreManagerTicket { id: string; title: string; description: string | null; category: string | null; status: ClientStatus; priority: Priority; operationalImpact: string | null; createdAt: string; supplierAssigned: boolean; jobRef: string | null }
export interface StoreManagerData {
  storeName: string
  company: string
  branch: string
  branchCode: string
  health: StoreHealthResult | null
  open: number; inProgress: number; completed: number; cancelled: number
  awaitingInput: number
  tickets: StoreManagerTicket[]
  generatedAt: string
}

export async function assembleStoreManagerDashboard(companyId: string, storeIds: string[], now: Date = new Date()): Promise<StoreManagerData> {
  const db = createAdminClient()
  if (!storeIds.length) return { storeName: 'Store', company: '', branch: '', branchCode: '', health: null, open: 0, inProgress: 0, completed: 0, cancelled: 0, awaitingInput: 0, tickets: [], generatedAt: now.toISOString() }
  const rules = await loadSlaResolver(db, companyId)
  const [{ data: storesRaw }, { data: ticketsRaw }, { data: companyRow }] = await Promise.all([
    db.from('stores').select('id, name, sub_store, branch_code, region_id').in('id', storeIds),
    db.from('tickets').select(TICKET_COLS).eq('company_id', companyId).in('store_id', storeIds),
    db.from('companies').select('name').eq('id', companyId).maybeSingle(),
  ])
  const stores = (storesRaw ?? []) as any[]
  const tickets = ((ticketsRaw ?? []) as any[]).map(asTicket)
  const primary = stores[0]
  const health = primary ? calculateStoreHealth({ id: primary.id, region_id: primary.region_id }, tickets.filter(t => t.store_id === primary.id), rules, now) : null

  let open = 0, inProgress = 0, completed = 0, cancelled = 0, awaitingInput = 0
  const visible: StoreManagerTicket[] = []
  for (const t of tickets) {
    if (t.status === 'info_requested') awaitingInput++
    const v = clientVisible(t.status)
    if (!v) continue
    if (v === 'open') open++; else if (v === 'in_progress') inProgress++; else if (v === 'cancelled') cancelled++; else completed++
    visible.push({ id: t.id, title: t.title ?? 'Untitled', description: (t as any).description ?? null, category: t.category ?? null, status: v, priority: t.priority, operationalImpact: t.operational_impact ?? null, createdAt: t.created_at, supplierAssigned: !!t.supplier_id, jobRef: (t as any).job_ref ?? null })
  }
  visible.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  return {
    storeName: stores.map(s => [s.name, s.sub_store].filter(Boolean).join(' — '))[0] ?? 'Store',
    company: (companyRow as any)?.name ?? '',
    branch: primary?.sub_store || primary?.name || 'Store',
    branchCode: primary?.branch_code ?? '',
    health, open, inProgress, completed, cancelled, awaitingInput, tickets: visible, generatedAt: now.toISOString(),
  }
}

// ============================================================
// SUPPLIER DASHBOARD (own assigned tickets only)
// ============================================================
export interface SupplierTicketRow {
  id: string; storeName: string; branchCode: string | null; title: string; priority: Priority; status: string
  ageDays: number; createdAt: string; slaLabel: string; nextActionDueAt: string | null
  acknowledged: boolean; evidenceRequired: boolean; beforeUploaded: boolean; afterUploaded: boolean; cocUploaded: boolean
}
export interface SupplierDashboardData {
  perf: SupplierPerformance
  kpis: { open: number; overdue: number; dueToday: number; pendingQuotes: number; awaitingSignoff: number; evidenceMissing: number }
  tickets: SupplierTicketRow[]
  quotes: { id: string; ticketTitle: string; amount: number; status: string; createdAt: string }[]
  signoffs: { id: string; ticketTitle: string; status: string; createdAt: string }[]
  rating: { avg: number; count: number }
  generatedAt: string
}

export async function assembleSupplierDashboard(companyId: string, supplierIds: string[], now: Date = new Date()): Promise<SupplierDashboardData> {
  const db = createAdminClient()
  const emptyPerf = calculateSupplierPerformance('none', [], (p) => FALLBACK_SLA[p], now)
  if (!supplierIds.length) return { perf: emptyPerf, kpis: { open: 0, overdue: 0, dueToday: 0, pendingQuotes: 0, awaitingSignoff: 0, evidenceMissing: 0 }, tickets: [], quotes: [], signoffs: [], rating: { avg: 0, count: 0 }, generatedAt: now.toISOString() }
  const rules = await loadSlaResolver(db, companyId)

  // Own tickets (awarded) + tickets where invited to quote (competitive model).
  const [{ data: bySupplier }, { data: invRows }] = await Promise.all([
    db.from('tickets').select(TICKET_COLS).eq('company_id', companyId).in('supplier_id', supplierIds),
    db.from('ticket_suppliers').select('ticket_id').in('supplier_id', supplierIds).in('status', ['invited', 'quoted', 'awarded']),
  ])
  const owned = (bySupplier ?? []) as any[]
  const ownedIds = new Set(owned.map(t => t.id))
  const extraIds = Array.from(new Set((invRows ?? []).map(r => r.ticket_id))).filter(id => !ownedIds.has(id))
  const { data: invitedTickets } = extraIds.length ? await db.from('tickets').select(TICKET_COLS).in('id', extraIds) : { data: [] as any[] }
  const tickets = [...owned, ...((invitedTickets ?? []) as any[])].map(asTicket)
  const storeIds = Array.from(new Set(tickets.map(t => t.store_id)))
  const { data: storesRaw } = storeIds.length ? await db.from('stores').select('id, name, sub_store, branch_code').in('id', storeIds) : { data: [] as any[] }
  const storeName = new Map((storesRaw ?? []).map((s: any) => [s.id, storeLabel(s.name, s.sub_store)]))
  const storeBranch = new Map((storesRaw ?? []).map((s: any) => [s.id, s.branch_code ?? null]))
  const titleOf = new Map(tickets.map(t => [t.id, t.title ?? 'Ticket']))

  const [{ data: quotesRaw }, { data: signoffsRaw }, { data: ratingRows }] = await Promise.all([
    db.from('quotes').select('id, ticket_id, amount, status, created_at').in('supplier_id', supplierIds).order('created_at', { ascending: false }),
    db.from('signoffs').select('id, ticket_id, status, created_at').in('supplier_id', supplierIds).order('created_at', { ascending: false }),
    db.from('ratings').select('score').in('supplier_id', supplierIds),
  ])
  const ratingScores = ((ratingRows ?? []) as any[]).map(r => Number(r.score)).filter(n => Number.isFinite(n))
  const rating = { avg: ratingScores.length ? ratingScores.reduce((s, n) => s + n, 0) / ratingScores.length : 0, count: ratingScores.length }

  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  let open = 0, overdue = 0, dueToday = 0, pendingQuotes = 0, awaitingSignoff = 0, evidenceMissing = 0
  const rows: SupplierTicketRow[] = []
  for (const t of tickets) {
    const active = isActive(t.status)
    const sla = computeTicketSla(t, rules(t.priority), now)
    if (active) {
      open++
      if (sla.supplierBreached) overdue++
      if (sla.nextActionDueAt && new Date(sla.nextActionDueAt) <= todayEnd && new Date(sla.nextActionDueAt) >= now) dueToday++
      if (t.status === 'submitted_for_signoff') awaitingSignoff++
      if (t.quote_required && !t.quote_submitted_at) pendingQuotes++
      if (t.evidence_required && !(t.before_photo_uploaded && t.after_photo_uploaded && t.completion_certificate_uploaded)) evidenceMissing++
      const lbl = sla.supplierBreached ? 'Breached' : sla.supplierStatus === 'paused' ? 'Paused (internal)' : sla.atRisk ? 'At risk' : sla.supplierStatus === 'not_started' ? 'Not started' : 'Running'
      rows.push({
        id: t.id, storeName: storeName.get(t.store_id) ?? 'Store', branchCode: storeBranch.get(t.store_id) ?? null, title: t.title ?? 'Ticket', priority: t.priority, status: t.status,
        ageDays: Math.floor((now.getTime() - new Date(t.created_at).getTime()) / DAY), createdAt: t.created_at, slaLabel: lbl, nextActionDueAt: sla.nextActionDueAt,
        acknowledged: !!t.first_response_at, evidenceRequired: !!t.evidence_required,
        beforeUploaded: !!t.before_photo_uploaded, afterUploaded: !!t.after_photo_uploaded, cocUploaded: !!t.completion_certificate_uploaded,
      })
    }
  }
  rows.sort((a, b) => (a.acknowledged === b.acknowledged ? 0 : a.acknowledged ? 1 : -1) || a.ageDays - b.ageDays)

  return {
    perf: calculateSupplierPerformance(supplierIds[0], tickets, rules, now),
    kpis: { open, overdue, dueToday, pendingQuotes, awaitingSignoff, evidenceMissing },
    tickets: rows,
    quotes: (quotesRaw ?? []).map((q: any) => ({ id: q.id, ticketTitle: titleOf.get(q.ticket_id) ?? 'Ticket', amount: q.amount, status: q.status, createdAt: q.created_at })),
    signoffs: (signoffsRaw ?? []).map((s: any) => ({ id: s.id, ticketTitle: titleOf.get(s.ticket_id) ?? 'Ticket', status: s.status, createdAt: s.created_at })),
    rating,
    generatedAt: now.toISOString(),
  }
}

function rank(r: RegionalHealthResult): number { return { controlled: 0, attention: 1, at_risk: 2, critical: 3 }[r.status] }
function storeRisk(s: StoreCard): number {
  const band = { controlled: 0, attention: 1, at_risk: 2, critical: 3 }[s.finalStatus]
  return band * 1000 + (100 - s.finalHealthScore) + s.safetyOpen * 20 + s.overdueTickets * 5 + s.pendingDecisions * 3
}
