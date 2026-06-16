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

export interface StoreCard extends StoreHealthResult { storeName: string; regionName: string }
export interface TrendDelta { dir: 'up' | 'down' | 'flat'; pct: number }
export interface EstateTrends { openWork: TrendDelta; slaPressure: TrendDelta; cost: TrendDelta; supplierBreaches: TrendDelta }
export interface ExposureBucket { label: string; value: number }
export interface EstateDashboardData {
  trends: EstateTrends
  estate: EstateHealthResult
  totalRegions: number
  regions: { rank: number; region: RegionalHealthResult; regionName: string; trend: TrendDelta }[]
  stores: StoreCard[]
  topRiskStores: StoreCard[]
  attentionStores: StoreCard[]
  controlledStores: StoreCard[]
  suppliers: { id: string; name: string; perf: SupplierPerformance; open: number; overdue: number; costExposure: number }[]
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
      return { id, name: supplierName.get(id) ?? 'Supplier', perf: calculateSupplierPerformance(id, ts, rules, now), open: act.length, overdue, costExposure }
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

  return {
    trends, estate, totalRegions: (regionsRaw ?? []).length, regions: ranking,
    stores: cards, topRiskStores, attentionStores, controlledStores, suppliers, repeatDefects,
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
export interface RegionalDashboardData {
  portfolio: RegionalHealthResult
  stores: StoreCard[]
  attentionStores: StoreCard[]
  ticketActions: RegionalTicketAction[]
  suppliers: { id: string; name: string; perf: SupplierPerformance; open: number; overdue: number; costExposure: number }[]
  signoffsPending: number
  snagsOpen: number
  generatedAt: string
}

export async function assembleRegionalDashboard(companyId: string, regionIds: string[], now: Date = new Date()): Promise<RegionalDashboardData> {
  const db = createAdminClient()
  const rules = await loadSlaResolver(db, companyId)
  const empty = (): RegionalDashboardData => ({
    portfolio: calculateRegionalPortfolioHealth('portfolio', [], { criticalTicketOverdue: false, supplierBreachOver3dCount: 0, internalBreachOver3dCount: 0, repeatAcrossStores: false, highValueBlocker: false, missingCriticalUpdates: false, openTickets: 0, overdueTickets: 0, costExposure: 0 }),
    stores: [], attentionStores: [], ticketActions: [], suppliers: [], signoffsPending: 0, snagsOpen: 0, generatedAt: now.toISOString(),
  })
  if (!regionIds.length) return empty()

  const [{ data: regionsRaw }, { data: storesRaw }, { data: ticketsRaw }, { data: suppliersRaw }] = await Promise.all([
    db.from('regions').select('id, name').in('id', regionIds),
    db.from('stores').select('id, name, sub_store, region_id').eq('company_id', companyId).in('region_id', regionIds).eq('active', true).is('closed_at', null),
    db.from('tickets').select(TICKET_COLS).eq('company_id', companyId).in('region_id', regionIds),
    db.from('suppliers').select('id, company_name').eq('company_id', companyId),
  ])
  const regionName = new Map((regionsRaw ?? []).map((r: any) => [r.id, r.name]))
  const stores = (storesRaw ?? []) as any[]
  const storeIds = stores.map(s => s.id)
  const storeName = new Map(stores.map(s => [s.id, [s.name, s.sub_store].filter(Boolean).join(' — ')]))
  const tickets = ((ticketsRaw ?? []) as any[]).map(asTicket)
  const supplierName = new Map((suppliersRaw ?? []).map((s: any) => [s.id, s.company_name]))

  const byStore = new Map<string, HealthTicket[]>()
  for (const t of tickets) { const a = byStore.get(t.store_id) ?? []; a.push(t); byStore.set(t.store_id, a) }

  const cards: StoreCard[] = stores.map(s => {
    const res = calculateStoreHealth({ id: s.id, region_id: s.region_id }, byStore.get(s.id) ?? [], rules, now)
    return { ...res, storeName: storeName.get(s.id) ?? 'Store', regionName: regionName.get(s.region_id) ?? '—' }
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
  const suppliers = [...bySupplier.entries()].map(([id, ts]) => {
    const act = ts.filter(t => isActive(t.status))
    const overdue = act.filter(t => { const s = computeTicketSla(t, rules(t.priority), now); return s.supplierBreached || s.internalBreached }).length
    return { id, name: supplierName.get(id) ?? 'Supplier', perf: calculateSupplierPerformance(id, ts, rules, now), open: act.length, overdue, costExposure: act.reduce((s, t) => s + (t.quote_value ?? 0), 0) }
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
  return { portfolio, stores: cards, attentionStores, ticketActions, suppliers, signoffsPending, snagsOpen, generatedAt: now.toISOString() }
}

// ============================================================
// STORE MANAGER DASHBOARD (simplified, own store only)
// ============================================================
export type ClientStatus = 'open' | 'in_progress' | 'completed'
function clientVisible(status: string): ClientStatus | null {
  if (status === 'cancelled' || status === 'declined') return null
  if (status === 'completed') return 'completed'
  if (status === 'open') return 'open'
  return 'in_progress'
}
export interface StoreManagerTicket { id: string; title: string; category: string | null; status: ClientStatus; createdAt: string; supplierAssigned: boolean }
export interface StoreManagerData {
  storeName: string
  health: StoreHealthResult | null
  open: number; inProgress: number; completed: number
  tickets: StoreManagerTicket[]
  generatedAt: string
}

export async function assembleStoreManagerDashboard(companyId: string, storeIds: string[], now: Date = new Date()): Promise<StoreManagerData> {
  const db = createAdminClient()
  if (!storeIds.length) return { storeName: 'Store', health: null, open: 0, inProgress: 0, completed: 0, tickets: [], generatedAt: now.toISOString() }
  const rules = await loadSlaResolver(db, companyId)
  const [{ data: storesRaw }, { data: ticketsRaw }] = await Promise.all([
    db.from('stores').select('id, name, sub_store, region_id').in('id', storeIds),
    db.from('tickets').select(TICKET_COLS).eq('company_id', companyId).in('store_id', storeIds),
  ])
  const stores = (storesRaw ?? []) as any[]
  const tickets = ((ticketsRaw ?? []) as any[]).map(asTicket)
  const primary = stores[0]
  const health = primary ? calculateStoreHealth({ id: primary.id, region_id: primary.region_id }, tickets.filter(t => t.store_id === primary.id), rules, now) : null

  let open = 0, inProgress = 0, completed = 0
  const visible: StoreManagerTicket[] = []
  for (const t of tickets) {
    const v = clientVisible(t.status)
    if (!v) continue
    if (v === 'open') open++; else if (v === 'in_progress') inProgress++; else completed++
    visible.push({ id: t.id, title: t.title ?? 'Untitled', category: t.category ?? null, status: v, createdAt: t.created_at, supplierAssigned: !!t.supplier_id })
  }
  visible.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  return {
    storeName: stores.map(s => [s.name, s.sub_store].filter(Boolean).join(' — '))[0] ?? 'Store',
    health, open, inProgress, completed, tickets: visible, generatedAt: now.toISOString(),
  }
}

// ============================================================
// SUPPLIER DASHBOARD (own assigned tickets only)
// ============================================================
export interface SupplierTicketRow {
  id: string; storeName: string; title: string; priority: Priority; status: string
  ageDays: number; slaLabel: string; nextActionDueAt: string | null
  acknowledged: boolean; evidenceRequired: boolean; beforeUploaded: boolean; afterUploaded: boolean; cocUploaded: boolean
}
export interface SupplierDashboardData {
  perf: SupplierPerformance
  kpis: { open: number; overdue: number; dueToday: number; pendingQuotes: number; awaitingSignoff: number; evidenceMissing: number }
  tickets: SupplierTicketRow[]
  quotes: { id: string; ticketTitle: string; amount: number; status: string; createdAt: string }[]
  signoffs: { id: string; ticketTitle: string; status: string; createdAt: string }[]
  generatedAt: string
}

export async function assembleSupplierDashboard(companyId: string, supplierIds: string[], now: Date = new Date()): Promise<SupplierDashboardData> {
  const db = createAdminClient()
  const emptyPerf = calculateSupplierPerformance('none', [], (p) => FALLBACK_SLA[p], now)
  if (!supplierIds.length) return { perf: emptyPerf, kpis: { open: 0, overdue: 0, dueToday: 0, pendingQuotes: 0, awaitingSignoff: 0, evidenceMissing: 0 }, tickets: [], quotes: [], signoffs: [], generatedAt: now.toISOString() }
  const rules = await loadSlaResolver(db, companyId)

  const { data: ticketsRaw } = await db.from('tickets').select(TICKET_COLS).eq('company_id', companyId).in('supplier_id', supplierIds)
  const tickets = ((ticketsRaw ?? []) as any[]).map(asTicket)
  const storeIds = Array.from(new Set(tickets.map(t => t.store_id)))
  const { data: storesRaw } = storeIds.length ? await db.from('stores').select('id, name, sub_store').in('id', storeIds) : { data: [] as any[] }
  const storeName = new Map((storesRaw ?? []).map((s: any) => [s.id, [s.name, s.sub_store].filter(Boolean).join(' — ')]))
  const titleOf = new Map(tickets.map(t => [t.id, t.title ?? 'Ticket']))

  const [{ data: quotesRaw }, { data: signoffsRaw }] = await Promise.all([
    db.from('quotes').select('id, ticket_id, amount, status, created_at').in('supplier_id', supplierIds).order('created_at', { ascending: false }),
    db.from('signoffs').select('id, ticket_id, status, created_at').in('supplier_id', supplierIds).order('created_at', { ascending: false }),
  ])

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
        id: t.id, storeName: storeName.get(t.store_id) ?? 'Store', title: t.title ?? 'Ticket', priority: t.priority, status: t.status,
        ageDays: Math.floor((now.getTime() - new Date(t.created_at).getTime()) / DAY), slaLabel: lbl, nextActionDueAt: sla.nextActionDueAt,
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
    generatedAt: now.toISOString(),
  }
}

function rank(r: RegionalHealthResult): number { return { controlled: 0, attention: 1, at_risk: 2, critical: 3 }[r.status] }
function storeRisk(s: StoreCard): number {
  const band = { controlled: 0, attention: 1, at_risk: 2, critical: 3 }[s.finalStatus]
  return band * 1000 + (100 - s.finalHealthScore) + s.safetyOpen * 20 + s.overdueTickets * 5 + s.pendingDecisions * 3
}
