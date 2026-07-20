// ============================================================
// MOTIV health engine v3 — executive data model (server-only)
// Loads company-scoped rows via the service-role client and runs the engine.
// Reads the v3 schema (companies/regions/stores/tickets/sla_rules/...).
// SERVER ONLY.
// ============================================================
import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/database.types'
import type { HealthTicket, Priority, SlaTargets, SlaRuleResolver } from './types'
import { isActive } from './types'
import { FALLBACK_SLA } from './constants'
import { calculateStoreHealth, type StoreHealthResult } from './storeHealth'
import { calculateTicketHealth } from './ticketHealth'
import { calculateRegionalPortfolioHealth, type RegionalHealthResult, type RegionalSignals } from './regionalHealth'
import { calculateEstateHealth, type EstateHealthResult } from './estateHealth'
import { calculateSupplierPerformance, type SupplierPerformance } from './supplierPerformance'
import { detectRepeatDefects, type RepeatDefect } from './repeatDefects'
import { getExecutiveDecisionItems, type DecisionItem } from './decisions'
import { computeTicketSla, supplierBreachOlderThan, internalBreachOlderThan } from './sla'
import { deriveDueDates } from './priority'
import { clientVisibleStatus, storeLabel } from '@/lib/utils'

/** Final resolution deadline + whether the ticket is overdue (active & past due). */
function dueInfo(t: HealthTicket, rules: SlaRuleResolver, now: Date): { dueAt: string; overdue: boolean } {
  const dueAt = deriveDueDates(t, rules(t.priority)).resolutionDue
  return { dueAt, overdue: isActive(t.status) && now.getTime() > new Date(dueAt).getTime() }
}
import type { TicketStatus } from '@/lib/types'

type DB = ReturnType<typeof createAdminClient>
type TicketRow = Database['public']['Tables']['tickets']['Row']
/** Full DB ticket row viewed through the engine's HealthTicket unions (priority text → P1..P4 etc). */
type Ticket = TicketRow & HealthTicket
const DAY = 24 * 3600_000
const HIGH_VALUE = 25_000

// ── SLA resolver: company row → platform default row → hardcoded fallback ──
export async function loadSlaResolver(db: DB, companyId: string | null): Promise<SlaRuleResolver> {
  const { data } = await db.from('sla_rules').select('*').or(companyId ? `company_id.eq.${companyId},company_id.is.null` : 'company_id.is.null')
  const rows = data ?? []
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
// The DB stores priority/impact/decision fields as plain text; the engine narrows them
// to their literal unions. Same object at runtime — this is a type-level view only.
function asTicket(r: TicketRow): Ticket { return r as Ticket }

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
export interface StoreCard extends StoreHealthResult { storeName: string; branchCode: string | null; location: string | null; regionName: string; sm?: StoreManagerContact | null; lastActivityAt?: string | null }
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
    db.from('stores').select('id, name, sub_store, branch_code, address, region_id').eq('company_id', companyId).eq('active', true).is('closed_at', null),
    db.from('tickets').select(TICKET_COLS).eq('company_id', companyId),
    db.from('suppliers').select('id, company_name').eq('company_id', companyId),
  ])

  const regionName = new Map((regionsRaw ?? []).map(r => [r.id, r.name]))
  const stores = storesRaw ?? []
  const storeName = new Map(stores.map(s => [s.id, storeLabel(s.name, s.sub_store)]))
  const storeBranch = new Map(stores.map(s => [s.id, s.branch_code ?? null]))
  const storeAddr = new Map(stores.map(s => [s.id, s.address ?? null]))
  const tickets = (ticketsRaw ?? []).map(asTicket)
  const supplierName = new Map((suppliersRaw ?? []).map(s => [s.id, s.company_name]))

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
    const res = calculateStoreHealth({ id: s.id, region_id: s.region_id }, ticketsByStore.get(s.id) ?? [], rules, now)
    return { ...res, storeName: storeName.get(s.id) ?? 'Store', branchCode: storeBranch.get(s.id) ?? null, location: storeAddr.get(s.id) ?? null, regionName: regionName.get(s.region_id ?? '') ?? '—' }
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
  const p = data ?? null
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
  for (const r of data ?? []) if (r.supplier_id != null && r.performance_score != null) m.set(r.supplier_id, Number(r.performance_score))
  return m
}

// Map store_id → yesterday's final_health_score (store trend arrows).
async function loadStorePrevHealth(db: DB, companyId: string, now: Date): Promise<Map<string, number>> {
  const yesterday = new Date(now.getTime() - DAY).toISOString().slice(0, 10)
  const { data } = await db.from('store_health_scores')
    .select('store_id, final_health_score').eq('company_id', companyId).eq('snapshot_date', yesterday)
  const m = new Map<string, number>()
  for (const r of data ?? []) if (r.store_id != null && r.final_health_score != null) m.set(r.store_id, Number(r.final_health_score))
  return m
}

// Overall supplier SLA % per day for the last ~6 snapshot dates (SLA-trend sparkline).
async function loadSupplierSlaSeries(db: DB, companyId: string, now: Date): Promise<{ label: string; value: number }[]> {
  const from = new Date(now.getTime() - 42 * DAY).toISOString().slice(0, 10)
  const { data } = await db.from('supplier_performance_scores')
    .select('snapshot_date, performance_score').eq('company_id', companyId).gte('snapshot_date', from)
    .order('snapshot_date', { ascending: true })
  const byDate = new Map<string, number[]>()
  for (const r of data ?? []) {
    if (r.performance_score == null) continue
    const arr = byDate.get(r.snapshot_date) ?? []; arr.push(Number(r.performance_score)); byDate.set(r.snapshot_date, arr)
  }
  const dates = [...byDate.keys()].sort().slice(-6)
  return dates.map(d => {
    const xs = byDate.get(d)!
    return { label: new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' }), value: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) }
  })
}

// Recent supplier escalations joined with supplier name.
async function loadEscalations(db: DB, companyId: string, supplierName: Map<string, string>): Promise<SupplierEscalationRow[]> {
  const { data } = await db.from('supplier_escalations')
    .select('id, supplier_id, issue, action_required, status, escalated_by, escalated_at')
    .eq('company_id', companyId).order('escalated_at', { ascending: false }).limit(20)
  return (data ?? []).map(r => ({
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
  for (const r of data ?? []) if (r.region_id != null && r.final_portfolio_health != null) m.set(r.region_id, Number(r.final_portfolio_health))
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
  id: string; title: string; category: string | null; scheduledAt: string | null
  storeName: string; branchCode: string | null
  status: string; priority: Priority; jobRef: string | null; jobNumber: number | null; createdAt: string
  quoteRequestedAt: string | null; quoteReceivedAt: string | null; quoteAcceptedAt: string | null
  breached: boolean; supplierBreached: boolean; internalBreached: boolean
  dueAt: string; slaDueAt: string | null; overdue: boolean; infoAdded: boolean
  supplierAssigned: boolean
  // The supplier confirmed there are no further variation orders → RM can close out.
  voNoneConfirmed: boolean
  // An open supplier↔RM dispute (snag / evidence) — the badge reads "Dispute".
  disputed: boolean
  // The open dispute's latest message is from the supplier (awaiting the RM's reply).
  disputeUnread: boolean
  // Suppliers already on this ticket (invited/quoted) and those who declined it —
  // so the "Assign supplier" picker (from the Today queue) can grey out the ones
  // already engaged and flag the ones who declined before.
  engagedSupplierIds: Record<string, 'invited' | 'quoted'>
  declinedSupplierIds: string[]
  // Latest snag's schedule state + description — drives the RM snag rows (the
  // proposed/declined fix date and what the snag is about).
  snagScheduledAt: string | null
  snagScheduleStatus: string | null
  snagDescription: string | null
}
export interface RegionalDashboardData {
  portfolio: RegionalHealthResult
  stores: StoreCard[]
  attentionStores: StoreCard[]
  ticketActions: RegionalTicketAction[]
  tickets: RegionalTicketRow[]
  suppliers: { id: string; name: string; category: string | null; contactName: string | null; phone: string | null; email: string | null; perf: SupplierPerformance; open: number; overdue: number; costExposure: number; avgRating: number; ratingCount: number }[]
  quoteTotals: { accepted: number; pending: number; voPending: number }
  signoffsPending: number
  snagsOpen: number
  // Live breach counts (any active ticket currently past its deadline) for the
  // dashboard KPIs — matches the Tickets-tab "SLA Breached" count. Distinct from
  // the health-SCORE penalty, which only counts breaches >3 days old.
  breachesNow: { supplier: number; internal: number }
  generatedAt: string
}

export async function assembleRegionalDashboard(companyId: string, regionIds: string[], now: Date = new Date()): Promise<RegionalDashboardData> {
  const db = createAdminClient()
  const rules = await loadSlaResolver(db, companyId)
  const empty = (): RegionalDashboardData => ({
    portfolio: calculateRegionalPortfolioHealth('portfolio', [], { criticalTicketOverdue: false, supplierBreachOver3dCount: 0, internalBreachOver3dCount: 0, repeatAcrossStores: false, highValueBlocker: false, missingCriticalUpdates: false, openTickets: 0, overdueTickets: 0, costExposure: 0 }),
    stores: [], attentionStores: [], ticketActions: [], tickets: [], suppliers: [], quoteTotals: { accepted: 0, pending: 0, voPending: 0 }, signoffsPending: 0, snagsOpen: 0, breachesNow: { supplier: 0, internal: 0 }, generatedAt: now.toISOString(),
  })
  if (!regionIds.length) return empty()

  const [{ data: regionsRaw }, { data: storesRaw }, { data: suppliersRaw }] = await Promise.all([
    db.from('regions').select('id, name').in('id', regionIds),
    db.from('stores').select('id, name, sub_store, branch_code, address, region_id').eq('company_id', companyId).in('region_id', regionIds).eq('active', true).is('closed_at', null),
    db.from('suppliers').select('id, company_name, active, contact_name, email, phone, trade, trades').eq('company_id', companyId),
  ])
  const regionName = new Map((regionsRaw ?? []).map(r => [r.id, r.name]))
  const stores = storesRaw ?? []
  const storeIds = stores.map(s => s.id)
  // Tickets are keyed off store membership (the durable store→region link), NOT the
  // denormalised tickets.region_id — so a ticket logged BEFORE its store was linked
  // to this region (region_id still null/stale) still surfaces for the RM.
  const { data: ticketsRaw } = storeIds.length
    ? await db.from('tickets').select(TICKET_COLS).eq('company_id', companyId).in('store_id', storeIds)
    : { data: null }
  const storeName = new Map(stores.map(s => [s.id, storeLabel(s.name, s.sub_store)]))
  const storeBranch = new Map(stores.map(s => [s.id, s.branch_code ?? null]))
  const storeAddr = new Map(stores.map(s => [s.id, s.address ?? null]))
  const tickets = (ticketsRaw ?? []).map(asTicket)
  const supplierName = new Map((suppliersRaw ?? []).map(s => [s.id, s.company_name]))

  // Quote milestones per ticket: first quote received + when one was accepted.
  const ticketIds = tickets.map(t => t.id)
  const { data: quoteRows } = ticketIds.length ? await db.from('quotes').select('ticket_id, status, created_at, amount').in('ticket_id', ticketIds) : { data: null }
  // Tickets with an OPEN dispute → the badge reads "Dispute" everywhere.
  const { data: openDisputeRows } = ticketIds.length ? await db.from('ticket_disputes').select('ticket_id').eq('status', 'open').in('ticket_id', ticketIds) : { data: null }
  const disputedIds = new Set<string>((openDisputeRows ?? []).map(d => d.ticket_id))
  // Latest dispute-message author per open-dispute ticket → "new message" flag (a
  // message from the supplier awaits the RM's reply).
  const { data: dmsgR } = disputedIds.size ? await db.from('ticket_dispute_messages').select('ticket_id, author_role, created_at').in('ticket_id', [...disputedIds]).order('created_at', { ascending: false }) : { data: null }
  const latestDisputeAuthor = new Map<string, string>()
  for (const m of dmsgR ?? []) if (!latestDisputeAuthor.has(m.ticket_id)) latestDisputeAuthor.set(m.ticket_id, m.author_role)
  // Suppliers on each ticket — invited/quoted (already engaged) vs declined/closed —
  // so the Today queue's "Assign supplier" picker can grey out the engaged ones and
  // flag the ones who declined this ticket before.
  const { data: ticketSupplierRows } = ticketIds.length ? await db.from('ticket_suppliers').select('ticket_id, supplier_id, status').in('ticket_id', ticketIds) : { data: null }
  const engagedByTicket = new Map<string, Record<string, 'invited' | 'quoted'>>()
  const declinedByTicket = new Map<string, string[]>()
  for (const r of ticketSupplierRows ?? []) {
    if (r.status === 'invited' || r.status === 'quoted') {
      const m = engagedByTicket.get(r.ticket_id) ?? {}; m[r.supplier_id] = r.status; engagedByTicket.set(r.ticket_id, m)
    } else if (r.status === 'declined' || r.status === 'closed') {
      const a = declinedByTicket.get(r.ticket_id) ?? []; a.push(r.supplier_id); declinedByTicket.set(r.ticket_id, a)
    }
  }
  // Latest snag per ticket (newest first) — schedule state + description for the
  // RM ticket rows (proposed/declined fix date; a declined date survives on the row).
  const { data: snagRows } = ticketIds.length ? await db.from('snags').select('ticket_id, scheduled_at, schedule_status, description, created_at').in('ticket_id', ticketIds).order('created_at', { ascending: false }) : { data: null }
  const latestSnagByTicket = new Map<string, { scheduled_at: string | null; schedule_status: string | null; description: string | null }>()
  for (const s of snagRows ?? []) if (s.ticket_id && !latestSnagByTicket.has(s.ticket_id)) latestSnagByTicket.set(s.ticket_id, s)
  const firstQuoteAt = new Map<string, string>(); const acceptedQuoteAt = new Map<string, string>()
  // Region-wide quote value totals (R) by status, for the RM "Quote Value" KPI.
  let acceptedQuoteValue = 0, pendingQuoteValue = 0
  for (const q of quoteRows ?? []) {
    const cur = firstQuoteAt.get(q.ticket_id)
    if (!cur || new Date(q.created_at) < new Date(cur)) firstQuoteAt.set(q.ticket_id, q.created_at)
    if (q.status === 'accepted') { acceptedQuoteAt.set(q.ticket_id, q.created_at); acceptedQuoteValue += Number(q.amount ?? 0) }
    if (q.status === 'pending') pendingQuoteValue += Number(q.amount ?? 0)
  }
  // Variation orders: an APPROVED VO adds to the Accepted quote value; a PENDING VO
  // (awaiting the RM's approval) is tracked as its own "VO pending" total.
  let voPendingValue = 0
  const { data: variationRows } = ticketIds.length ? await db.from('ticket_variations').select('status, amount').in('ticket_id', ticketIds) : { data: null }
  for (const v of variationRows ?? []) {
    if (v.status === 'approved') acceptedQuoteValue += Number(v.amount ?? 0)
    else if (v.status === 'pending') voPendingValue += Number(v.amount ?? 0)
  }
  // Ticket rows (most-recent first) for the recent card + tickets tab.
  const ticketRows: RegionalTicketRow[] = [...tickets]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .map(t => {
      const s = isActive(t.status) ? computeTicketSla(t, rules(t.priority), now) : null
      return {
      id: t.id, title: t.title ?? 'Untitled',
      category: t.category ?? null, scheduledAt: t.scheduled_at ?? null,
      storeName: storeName.get(t.store_id) ?? 'Store', branchCode: storeBranch.get(t.store_id) ?? null,
      status: t.status, priority: t.priority, jobRef: t.job_ref ?? null, jobNumber: t.job_number ?? null, createdAt: t.created_at,
      quoteRequestedAt: t.quote_requested_at ?? null,
      quoteReceivedAt: firstQuoteAt.get(t.id) ?? null,
      quoteAcceptedAt: (t.quote_decision_status === 'approved' ? t.quote_decided_at : null) ?? acceptedQuoteAt.get(t.id) ?? null,
      breached: !!s && (s.supplierBreached || s.internalBreached),
      supplierBreached: !!s?.supplierBreached, internalBreached: !!s?.internalBreached,
      slaDueAt: s?.nextActionDueAt ?? null,
      ...dueInfo(t, rules, now),
      infoAdded: t.status === 'open' && !!t.info_request_reason,
      supplierAssigned: !!t.supplier_id,
      voNoneConfirmed: !!t.vo_none_confirmed_at,
      disputed: disputedIds.has(t.id),
      disputeUnread: disputedIds.has(t.id) && latestDisputeAuthor.get(t.id) === 'supplier',
      engagedSupplierIds: engagedByTicket.get(t.id) ?? {},
      declinedSupplierIds: declinedByTicket.get(t.id) ?? [],
      snagScheduledAt: latestSnagByTicket.get(t.id)?.scheduled_at ?? null,
      snagScheduleStatus: latestSnagByTicket.get(t.id)?.schedule_status ?? null,
      snagDescription: latestSnagByTicket.get(t.id)?.description ?? null,
      }
    })

  const byStore = new Map<string, Ticket[]>()
  for (const t of tickets) { const a = byStore.get(t.store_id) ?? []; a.push(t); byStore.set(t.store_id, a) }

  // SM contact per store — derived from the most recent store_manager who logged a
  // ticket there (no canonical store→manager link exists in the schema).
  const creatorIds = Array.from(new Set(tickets.map(t => t.created_by).filter((id): id is string => !!id)))
  const { data: profRows } = creatorIds.length
    ? await db.from('user_profiles').select('id, full_name, email, phone, role').in('id', creatorIds)
    : { data: null }
  const smProfile = new Map<string, StoreManagerContact>()
  for (const p of profRows ?? []) if (p.role === 'store_manager') smProfile.set(p.id, { name: p.full_name ?? null, email: p.email ?? null, phone: p.phone ?? null })
  const storeSm = new Map<string, StoreManagerContact>()
  for (const t of [...tickets].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))) {
    if (storeSm.has(t.store_id)) continue
    const sm = t.created_by ? smProfile.get(t.created_by) : undefined
    if (sm) storeSm.set(t.store_id, sm)
  }

  const cards: StoreCard[] = stores.map(s => {
    const stTickets = byStore.get(s.id) ?? []
    const res = calculateStoreHealth({ id: s.id, region_id: s.region_id }, stTickets, rules, now)
    // Last activity = the store's most recent ticket touch (supplier/internal update,
    // else the ticket's updated/created time) — powers the Stores table column.
    const lastActivityAt = stTickets.reduce<string | null>((acc, t) => {
      const at = t.last_supplier_update_at ?? t.last_internal_update_at ?? t.updated_at ?? t.created_at
      return at && (!acc || new Date(at) > new Date(acc)) ? at : acc
    }, null)
    return { ...res, storeName: storeName.get(s.id) ?? 'Store', branchCode: storeBranch.get(s.id) ?? null, location: storeAddr.get(s.id) ?? null, regionName: regionName.get(s.region_id ?? '') ?? '—', sm: storeSm.get(s.id) ?? null, lastActivityAt }
  })
  const portfolio = calculateRegionalPortfolioHealth('portfolio', cards, regionSignals(tickets, rules, now))

  // Live breach counts for the KPIs: an active ticket past its supplier/internal
  // deadline but NOT yet fully overdue (overdue ones are counted by the separate
  // Overdue KPI) — so the dashboard matches the split Tickets-tab pills. The
  // health score keeps its own >3d grace above.
  let breachSupplierNow = 0, breachInternalNow = 0
  for (const t of tickets) {
    if (!isActive(t.status)) continue
    const s = computeTicketSla(t, rules(t.priority), now)
    if (dueInfo(t, rules, now).overdue) continue
    if (s.supplierBreached) breachSupplierNow++
    if (s.internalBreached) breachInternalNow++
  }

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
  for (const r of ratingRows ?? []) {
    if (!r.supplier_id || r.score == null) continue
    const a = ratingAgg.get(r.supplier_id) ?? { sum: 0, n: 0 }; a.sum += Number(r.score); a.n++; ratingAgg.set(r.supplier_id, a)
  }
  // Every active supplier in the company appears in the directory — those with no
  // tickets show neutral stats (score 100) — so a freshly added supplier is visible
  // immediately, not only once it lands on a ticket.
  const suppliers = (suppliersRaw ?? [])
    .filter(s => s.active !== false)
    .map(s => {
      const ts = bySupplier.get(s.id) ?? []
      const act = ts.filter(t => isActive(t.status))
      const overdue = act.filter(t => { const x = computeTicketSla(t, rules(t.priority), now); return x.supplierBreached || x.internalBreached }).length
      const ra = ratingAgg.get(s.id)
      const trades: string[] = Array.isArray(s.trades) ? s.trades.filter(Boolean) : []
      const category = trades.length ? trades.join(', ') : (s.trade ?? null)
      return { id: s.id, name: s.company_name ?? 'Supplier', category, contactName: s.contact_name ?? null, phone: s.phone ?? null, email: s.email ?? null, perf: calculateSupplierPerformance(s.id, ts, rules, now), open: act.length, overdue, costExposure: act.reduce((sum: number, t: HealthTicket) => sum + (t.quote_value ?? 0), 0), avgRating: ra ? ra.sum / ra.n : 5, ratingCount: ra ? ra.n : 0 }
    })
    .sort((a, b) => a.perf.performanceScore - b.perf.performanceScore)

  // Pending sign-offs = tickets currently awaiting the RM's sign-off (status
  // submitted_for_signoff) — matches the Signoff tab exactly. Counting signoff ROWS
  // over-counts: a ticket sent back for more evidence keeps its 'submitted' row but
  // its status moves to evidence_requested, so it should drop out of this count.
  const signoffsPending = tickets.filter(t => t.status === 'submitted_for_signoff').length
  let snagsOpen = 0
  if (storeIds.length) {
    // A snag stays "open" from raise through accept (assigned) and the fix
    // (in_progress) until the RM accepts the corrective work (resolved). Counting
    // only open/in_progress dropped accepted snags, so the KPI read 0 with a live snag.
    const { count: nc } = await db.from('snags').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('store_id', storeIds).in('status', ['open', 'assigned', 'in_progress'])
    snagsOpen = nc ?? 0
  }

  const attentionStores = [...cards].filter(c => c.finalStatus !== 'controlled').sort((a, b) => a.finalHealthScore - b.finalHealthScore)
  return { portfolio, stores: cards, attentionStores, ticketActions, tickets: ticketRows, suppliers, quoteTotals: { accepted: acceptedQuoteValue, pending: pendingQuoteValue, voPending: voPendingValue }, signoffsPending, snagsOpen, breachesNow: { supplier: breachSupplierNow, internal: breachInternalNow }, generatedAt: now.toISOString() }
}

// ============================================================
// STORE MANAGER DASHBOARD (simplified, own store only)
// ============================================================
export type ClientStatus = 'open' | 'info_requested' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
// Single source of truth for the SM/client Open → In Progress → Completed
// collapse lives in lib/utils (clientVisibleStatus). Re-use it here so the
// dashboard counts and the ticket-detail badge can never disagree (previously
// this mapped everything-not-open → in_progress, which is why an assigned/quoted
// ticket read "Open" on the detail page but "In Progress" on the dashboard).
const clientVisible = (status: string): ClientStatus | null =>
  clientVisibleStatus(status as TicketStatus)
export interface StoreManagerTicket { id: string; title: string; description: string | null; category: string | null; status: ClientStatus; rawStatus: string; priority: Priority; operationalImpact: string | null; createdAt: string; supplierAssigned: boolean; jobRef: string | null; jobNumber: number | null; dueAt: string; overdue: boolean; infoAdded: boolean; photoUrls: string[]; infoDocUrls: string[]; infoRequestReason: string | null }
export interface StoreManagerData {
  storeName: string
  company: string
  branch: string
  branchCode: string
  health: StoreHealthResult | null
  open: number; scheduled: number; inProgress: number; completed: number; cancelled: number
  awaitingInput: number
  tickets: StoreManagerTicket[]
  generatedAt: string
}

export async function assembleStoreManagerDashboard(companyId: string, storeIds: string[], now: Date = new Date()): Promise<StoreManagerData> {
  const db = createAdminClient()
  if (!storeIds.length) return { storeName: 'Store', company: '', branch: '', branchCode: '', health: null, open: 0, scheduled: 0, inProgress: 0, completed: 0, cancelled: 0, awaitingInput: 0, tickets: [], generatedAt: now.toISOString() }
  const rules = await loadSlaResolver(db, companyId)
  const [{ data: storesRaw }, { data: ticketsRaw }, { data: companyRow }] = await Promise.all([
    db.from('stores').select('id, name, sub_store, branch_code, region_id').in('id', storeIds),
    db.from('tickets').select(TICKET_COLS).eq('company_id', companyId).in('store_id', storeIds),
    db.from('companies').select('name').eq('id', companyId).maybeSingle(),
  ])
  const stores = storesRaw ?? []
  const tickets = (ticketsRaw ?? []).map(asTicket)
  const primary = stores[0]
  const health = primary ? calculateStoreHealth({ id: primary.id, region_id: primary.region_id }, tickets.filter(t => t.store_id === primary.id), rules, now) : null

  let open = 0, scheduled = 0, inProgress = 0, completed = 0, cancelled = 0, awaitingInput = 0
  const visible: StoreManagerTicket[] = []
  for (const t of tickets) {
    if (t.status === 'info_requested') awaitingInput++
    const v = clientVisible(t.status)
    if (!v) continue
    // "Open" is an umbrella: every active ticket (not completed/cancelled) counts, so a
    // ticket stays under Open — alongside its Scheduled / In-progress card — until it's
    // completed.
    if (v !== 'completed' && v !== 'cancelled') open++
    if (v === 'scheduled') scheduled++; else if (v === 'in_progress') inProgress++; else if (v === 'cancelled') cancelled++; else if (v === 'completed') completed++
    // info_requested is tracked via awaitingInput (its own KPI), not the open count
    const { dueAt, overdue } = dueInfo(t, rules, now)
    // "Info added" = the SM resubmitted after the RM requested info (back at open, reason kept).
    const infoAdded = t.status === 'open' && !!t.info_request_reason
    visible.push({ id: t.id, title: t.title ?? 'Untitled', description: t.description ?? null, category: t.category ?? null, status: v, rawStatus: t.status, priority: t.priority, operationalImpact: t.operational_impact ?? null, createdAt: t.created_at, supplierAssigned: !!t.supplier_id, jobRef: t.job_ref ?? null, jobNumber: t.job_number ?? null, dueAt, overdue, infoAdded,
      photoUrls: Array.isArray(t.photo_urls) ? t.photo_urls : [],
      infoDocUrls: Array.isArray(t.info_doc_urls) ? t.info_doc_urls : [],
      infoRequestReason: t.info_request_reason ?? null })
  }
  visible.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  return {
    storeName: stores.length ? storeLabel(stores[0].name, stores[0].sub_store) : 'Store',
    company: companyRow?.name ?? '',
    branch: primary?.sub_store || primary?.name || 'Store',
    branchCode: primary?.branch_code ?? '',
    health, open, scheduled, inProgress, completed, cancelled, awaitingInput, tickets: visible, generatedAt: now.toISOString(),
  }
}

// ============================================================
// SUPPLIER DASHBOARD (own assigned tickets only)
// ============================================================
export interface SupplierTicketRow {
  id: string; storeName: string; branchCode: string | null; title: string; category: string | null; priority: Priority; status: string
  jobRef: string | null; jobNumber: number | null; description: string | null
  ageDays: number; createdAt: string; slaLabel: string; nextActionDueAt: string | null
  acknowledged: boolean; evidenceRequired: boolean; beforeUploaded: boolean; afterUploaded: boolean; cocUploaded: boolean
  active: boolean; breached: boolean
  // Standalone Individual (home) job — no client company/store. Drives the
  // supplier UI to label it "Individual" instead of a company · store.
  isIndividual: boolean
  assignedAt: string | null; quoteRequestedAt: string | null; quoteSubmittedAt: string | null; quoteApprovedAt: string | null; declinedAt: string | null
  dueAt: string; overdue: boolean; declinedForMe: boolean; declinedBy: 'supplier' | 'regional_manager' | null
  // Isolation: this supplier's OWN involvement, so the list never leaks another
  // supplier's progress (e.g. "Quoted" because someone else quoted).
  quotedByMe: boolean; awardedToMe: boolean
  // The supplier confirmed there are no further variation orders (ready for the RM's close-out).
  voNoneConfirmed: boolean
  // The ticket has at least one APPROVED variation order (own awarded jobs only).
  hasApprovedVo: boolean
  // An open dispute on their awarded job — the badge reads "Dispute".
  disputed: boolean
  // The open dispute's latest message is from the RM (awaiting the supplier's reply).
  disputeUnread: boolean
  // Why the manager raised the latest snag (newest rejected signoff's reason).
  snagReason: string | null
  // The manager's "more evidence" request message (only while status = evidence_requested).
  evidenceRequestReason: string | null
  // The RM declined this supplier's quote and asked them to re-quote (re-invited).
  requoteRequested: boolean
  // Why their quote was declined (shown in the re-quote flow).
  declineReason: string | null
  // Latest snag's schedule state — after the RM declines a proposed snag-fix date
  // the declined date + reason survive on the snag row and drive the reschedule CTA.
  snagScheduledAt: string | null
  snagScheduleStatus: string | null
  snagScheduleDeclineReason: string | null
}
export interface SupplierQuoteRow { id: string; ticketId: string; ticketTitle: string; ticketStatus: string; storeName: string; branchCode: string | null; amount: number; amountInclVat: number | null; status: string; createdAt: string; category: string | null; priority: Priority; jobRef: string | null; description: string | null; validUntil: string | null; proposedScheduleAt: string | null; reQuoteRequested: boolean }
export interface SupplierSignoffRow { id: string; ticketId: string; ticketTitle: string; ticketStatus: string; storeName: string; branchCode: string | null; status: string; createdAt: string; category: string | null; priority: Priority; description: string | null; jobRef: string | null; photoCount: number; certCount: number; decidedAt: string | null; decidedBy: string | null }
export interface SupplierDashboardData {
  perf: SupplierPerformance
  company: string
  kpis: { open: number; overdue: number; dueToday: number; pendingQuotes: number; awaitingSignoff: number; evidenceMissing: number; scheduled: number }
  tickets: SupplierTicketRow[]
  quotes: SupplierQuoteRow[]
  signoffs: SupplierSignoffRow[]
  rating: { avg: number; count: number }
  generatedAt: string
}

export async function assembleSupplierDashboard(companyId: string | null, supplierIds: string[], now: Date = new Date()): Promise<SupplierDashboardData> {
  const db = createAdminClient()
  const emptyPerf = calculateSupplierPerformance('none', [], (p) => FALLBACK_SLA[p], now)
  if (!supplierIds.length) return { perf: emptyPerf, company: '', kpis: { open: 0, overdue: 0, dueToday: 0, pendingQuotes: 0, awaitingSignoff: 0, evidenceMissing: 0, scheduled: 0 }, tickets: [], quotes: [], signoffs: [], rating: { avg: 5, count: 0 }, generatedAt: now.toISOString() }
  const rules = await loadSlaResolver(db, companyId)

  // Own tickets (awarded) + tickets where invited to quote (competitive model),
  // plus declined/closed so the supplier still sees them under the Declined filter.
  const [{ data: bySupplier }, { data: invRows }] = await Promise.all([
    // Tickets awarded to this supplier — across ANY company (a Motiv/pool supplier
    // is awarded client-company tickets they don't belong to). Scoped to their
    // supplier ids, which is the real ownership gate.
    db.from('tickets').select(TICKET_COLS).in('supplier_id', supplierIds),
    db.from('ticket_suppliers').select('ticket_id, status, responded_at, declined_by, requote_requested_at').in('supplier_id', supplierIds).in('status', ['invited', 'quoted', 'awarded', 'declined', 'closed']),
  ])
  const owned = bySupplier ?? []
  const ownedIds = new Set(owned.map(t => t.id))
  // The supplier's invite status per ticket (newest row wins if duplicated).
  const myInviteStatus = new Map<string, string>()
  // When the supplier was declined/closed off the ticket — used as the decline date
  // when there's no declined quote to date it (e.g. they declined before quoting).
  const declinedInviteAt = new Map<string, string>()
  // Who took them off it: 'supplier' (self) vs 'regional_manager' (declined quote).
  const declinedByOf = new Map<string, 'supplier' | 'regional_manager'>()
  // The RM asked this supplier to (re-)submit a quote after a decline → drives the
  // "Re-quote requested" flag on the Quotes tab.
  const requoteAt = new Map<string, string>()
  for (const r of invRows ?? []) {
    myInviteStatus.set(r.ticket_id, r.status)
    if (['declined', 'closed'].includes(r.status) && r.responded_at) declinedInviteAt.set(r.ticket_id, r.responded_at)
    if (r.declined_by === 'supplier' || r.declined_by === 'regional_manager') declinedByOf.set(r.ticket_id, r.declined_by)
    if (r.requote_requested_at) requoteAt.set(r.ticket_id, r.requote_requested_at)
  }
  const extraIds = Array.from(new Set((invRows ?? []).map(r => r.ticket_id))).filter(id => !ownedIds.has(id))
  const { data: invitedTickets } = extraIds.length ? await db.from('tickets').select(TICKET_COLS).in('id', extraIds) : { data: null }
  const rawAll = [...owned, ...(invitedTickets ?? [])]
  const rawById = new Map(rawAll.map(r => [r.id, r]))
  const tickets = rawAll.map(asTicket)
  const storeIds = Array.from(new Set(tickets.map(t => t.store_id)))
  const { data: storesRaw } = storeIds.length ? await db.from('stores').select('id, name, sub_store, branch_code').in('id', storeIds) : { data: null }
  const storeName = new Map((storesRaw ?? []).map(s => [s.id, storeLabel(s.name, s.sub_store)]))
  const storeBranch = new Map((storesRaw ?? []).map(s => [s.id, s.branch_code ?? null]))
  const titleOf = new Map(tickets.map(t => [t.id, t.title ?? 'Ticket']))

  const [{ data: quotesRaw }, { data: signoffsRaw }, { data: ratingRows }, { data: companyRow }, { data: snagRows }] = await Promise.all([
    db.from('quotes').select('id, ticket_id, amount, amount_incl_vat, status, created_at, updated_at, valid_until, proposed_schedule_at, decline_reason').in('supplier_id', supplierIds).order('created_at', { ascending: false }),
    db.from('signoffs').select('id, ticket_id, status, created_at, before_urls, after_urls, coc_url, invoice_url, reviewed_at, reviewed_by, reject_reason').in('supplier_id', supplierIds).order('created_at', { ascending: false }),
    db.from('ratings').select('score').in('supplier_id', supplierIds),
    companyId ? db.from('companies').select('name').eq('id', companyId).maybeSingle() : Promise.resolve({ data: null as { name: string } | null }),
    // Own-org snags only (cross-supplier isolation) — the latest snag per ticket
    // carries the schedule state for the reschedule CTA after an RM decline.
    db.from('snags').select('ticket_id, scheduled_at, schedule_status, schedule_decline_reason, created_at').in('supplier_id', supplierIds).order('created_at', { ascending: false }),
  ])
  // Manager names for the "decided by" line on each sign-off.
  const reviewerIds = [...new Set((signoffsRaw ?? []).map(s => s.reviewed_by).filter((id): id is string => !!id))]
  const { data: reviewerRows } = reviewerIds.length ? await db.from('user_profiles').select('id, full_name').in('id', reviewerIds) : { data: null }
  const reviewerName = new Map((reviewerRows ?? []).map(r => [r.id, r.full_name]))
  // Latest snag reason per ticket (the newest rejected signoff's reject_reason) —
  // shown on the Snags page cards.
  const snagReasonByTicket = new Map<string, string>()
  for (const s of (signoffsRaw ?? []).slice().sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))) {
    if (s.status === 'rejected' && s.reject_reason) snagReasonByTicket.set(s.ticket_id, s.reject_reason)
  }
  // Latest snag per ticket (rows arrive newest-first) — schedule state incl. a
  // declined proposed date, which now survives on the snag row.
  const latestSnagByTicket = new Map<string, { scheduled_at: string | null; schedule_status: string | null; schedule_decline_reason: string | null }>()
  for (const s of snagRows ?? []) if (s.ticket_id && !latestSnagByTicket.has(s.ticket_id)) latestSnagByTicket.set(s.ticket_id, s)
  // Why THIS supplier's latest declined quote was declined — shown when the RM has
  // asked them to re-quote (newest declined quote with a reason wins).
  const declineReasonByTicket = new Map<string, string>()
  for (const q of (quotesRaw ?? []).slice().sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))) {
    if (q.status === 'declined' && q.decline_reason) declineReasonByTicket.set(q.ticket_id, q.decline_reason)
  }
  const ratingScores = (ratingRows ?? []).map(r => Number(r.score)).filter(n => Number.isFinite(n))
  // Suppliers start at a full 5★ and degrade as real ratings arrive.
  const rating = { avg: ratingScores.length ? ratingScores.reduce((s, n) => s + n, 0) / ratingScores.length : 5, count: ratingScores.length }
  // Earliest accepted quote per ticket — fallback for the approval date.
  // firstQuoteAt = earliest quote submitted per ticket — used for the "Quoted" milestone.
  const acceptedQuoteAt = new Map<string, string>()
  const firstQuoteAt = new Map<string, string>()
  // declinedQuoteAt = when this supplier's quote was declined (quote.updated_at).
  const declinedQuoteAt = new Map<string, string>()
  for (const q of quotesRaw ?? []) {
    if (q.status === 'accepted') acceptedQuoteAt.set(q.ticket_id, q.created_at)
    if (q.status === 'declined') {
      const prev = declinedQuoteAt.get(q.ticket_id)
      const at = q.updated_at ?? q.created_at
      if (!prev || new Date(at) > new Date(prev)) declinedQuoteAt.set(q.ticket_id, at)
    }
    const cur = firstQuoteAt.get(q.ticket_id)
    if (!cur || new Date(q.created_at) < new Date(cur)) firstQuoteAt.set(q.ticket_id, q.created_at)
  }
  // Awarded jobs with an OPEN dispute → the badge reads "Dispute".
  const ownedIdList = Array.from(ownedIds)
  const { data: openDisputeRows } = ownedIdList.length ? await db.from('ticket_disputes').select('ticket_id').eq('status', 'open').in('ticket_id', ownedIdList) : { data: null }
  const disputedIds = new Set<string>((openDisputeRows ?? []).map(d => d.ticket_id))
  // Approved variation orders per ticket → hasApprovedVo. Ticket-id scoping
  // suffices for isolation: ownedIdList is already this supplier's awarded work
  // (VOs belong to the awarded org), so no supplier_id filter is needed.
  const { data: approvedVoRows } = ownedIdList.length ? await db.from('ticket_variations').select('ticket_id').eq('status', 'approved').in('ticket_id', ownedIdList) : { data: null }
  const approvedVoIds = new Set<string>((approvedVoRows ?? []).map(v => v.ticket_id))
  // Latest dispute-message author per open-dispute ticket → "new message" flag (a
  // message from the RM awaits the supplier's reply).
  const { data: dmsgS } = disputedIds.size ? await db.from('ticket_dispute_messages').select('ticket_id, author_role, created_at').in('ticket_id', [...disputedIds]).order('created_at', { ascending: false }) : { data: null }
  const latestDisputeAuthor = new Map<string, string>()
  for (const m of dmsgS ?? []) if (!latestDisputeAuthor.has(m.ticket_id)) latestDisputeAuthor.set(m.ticket_id, m.author_role)

  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  let open = 0, overdue = 0, dueToday = 0, pendingQuotes = 0, awaitingSignoff = 0, evidenceMissing = 0, scheduled = 0
  const rows: SupplierTicketRow[] = []
  for (const t of tickets) {
    const active = isActive(t.status)
    const raw: Partial<TicketRow> = rawById.get(t.id) ?? {}
    // Out of this supplier's active work if they were declined/closed off the ticket,
    // OR the ticket has been awarded to a *different* supplier.
    const awardedToOther = !!raw.supplier_id && !ownedIds.has(t.id)
    const declinedForMe = !ownedIds.has(t.id) && (['declined', 'closed'].includes(myInviteStatus.get(t.id) ?? '') || awardedToOther)
    const awardedToMe = ownedIds.has(t.id)
    const quotedByMe = awardedToMe || ['quoted', 'awarded'].includes(myInviteStatus.get(t.id) ?? '')
    const sla = computeTicketSla(t, rules(t.priority), now)
    if (active && !declinedForMe) {
      open++
      // "SLA Breached" KPI excludes tickets that have gone fully overdue — those are
      // counted by the separate Overdue KPI/filter, so the count matches the
      // Tickets-tab "SLA Breached" pill (breached && !overdue).
      if (sla.supplierBreached && !dueInfo(t, rules, now).overdue) overdue++
      if (sla.nextActionDueAt && new Date(sla.nextActionDueAt) <= todayEnd && new Date(sla.nextActionDueAt) >= now) dueToday++
      if (t.status === 'submitted_for_signoff') awaitingSignoff++
      // Job scheduled but not yet started — the supplier's own awarded work.
      if (t.status === 'scheduled' && awardedToMe) scheduled++
      if (t.quote_required && !t.quote_submitted_at) pendingQuotes++
      // Supplier owes after photos + COC; before photos come from ticket logging.
      if (t.evidence_required && !(t.after_photo_uploaded && t.completion_certificate_uploaded)) evidenceMissing++
    }
    const lbl = !active
      ? (t.status === 'completed' ? 'Completed' : t.status === 'cancelled' ? 'Cancelled' : t.status === 'declined' ? 'Declined' : 'Closed')
      : sla.supplierBreached ? 'Breached' : sla.supplierStatus === 'paused' ? 'Paused (internal)' : sla.atRisk ? 'At risk' : sla.supplierStatus === 'not_started' ? 'Not started' : 'Running'
    const approvedAt = (raw.quote_decision_status === 'approved' ? raw.quote_decided_at : null) ?? acceptedQuoteAt.get(t.id) ?? null
    rows.push({
      id: t.id, storeName: storeName.get(t.store_id) ?? (raw.company_id ? 'Store' : 'Individual'), branchCode: storeBranch.get(t.store_id) ?? null, title: t.title ?? 'Ticket', category: t.category ?? null, priority: t.priority, status: t.status,
      jobRef: raw.job_ref ?? null, jobNumber: raw.job_number ?? null, description: raw.description ?? null,
      ageDays: Math.floor((now.getTime() - new Date(t.created_at).getTime()) / DAY), createdAt: t.created_at, slaLabel: lbl, nextActionDueAt: sla.nextActionDueAt,
      acknowledged: !!t.first_response_at, evidenceRequired: !!t.evidence_required,
      beforeUploaded: !!t.before_photo_uploaded, afterUploaded: !!t.after_photo_uploaded, cocUploaded: !!t.completion_certificate_uploaded,
      active, breached: active ? sla.supplierBreached : false, isIndividual: !raw.company_id,
      assignedAt: raw.quote_requested_at ?? t.created_at ?? null,
      quoteRequestedAt: raw.quote_requested_at ?? null,
      // Scope the quote milestones to their own quote so the list can't leak another's.
      quoteSubmittedAt: quotedByMe ? (t.quote_submitted_at ?? firstQuoteAt.get(t.id) ?? null) : null,
      quoteApprovedAt: awardedToMe ? approvedAt : null,
      declinedAt: declinedQuoteAt.get(t.id) ?? declinedInviteAt.get(t.id) ?? null,
      ...dueInfo(t, rules, now),
      declinedForMe,
      declinedBy: declinedForMe ? (declinedByOf.get(t.id) ?? null) : null,
      quotedByMe, awardedToMe,
      voNoneConfirmed: !!raw.vo_none_confirmed_at,
      hasApprovedVo: awardedToMe && approvedVoIds.has(t.id),
      disputed: awardedToMe && disputedIds.has(t.id),
      disputeUnread: awardedToMe && disputedIds.has(t.id) && latestDisputeAuthor.get(t.id) === 'regional_manager',
      snagReason: snagReasonByTicket.get(t.id) ?? null,
      evidenceRequestReason: t.status === 'evidence_requested' ? (raw.evidence_request_reason ?? null) : null,
      // Re-quote = re-invited (status 'invited') AND a prior re-quote request stamp.
      requoteRequested: !awardedToMe && myInviteStatus.get(t.id) === 'invited' && !!requoteAt.get(t.id),
      declineReason: declineReasonByTicket.get(t.id) ?? null,
      snagScheduledAt: latestSnagByTicket.get(t.id)?.scheduled_at ?? null,
      snagScheduleStatus: latestSnagByTicket.get(t.id)?.schedule_status ?? null,
      snagScheduleDeclineReason: latestSnagByTicket.get(t.id)?.schedule_decline_reason ?? null,
    })
  }
  // Active first, then unacknowledged, then oldest — keeps the dashboard queues useful.
  rows.sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1) || (a.acknowledged === b.acknowledged ? 0 : a.acknowledged ? 1 : -1) || a.ageDays - b.ageDays)

  const storeOf = (ticketId: string) => rawById.get(ticketId)?.store_id
  // DB stores priority as plain text; the row shapes narrow it to the engine's P1..P4.
  const priorityOf = (rq: Partial<TicketRow>) => rq.priority as Priority
  return {
    perf: calculateSupplierPerformance(supplierIds[0], tickets, rules, now),
    company: companyRow?.name ?? '',
    kpis: { open, overdue, dueToday, pendingQuotes, awaitingSignoff, evidenceMissing, scheduled },
    tickets: rows,
    quotes: (quotesRaw ?? []).map(q => { const rq: Partial<TicketRow> = rawById.get(q.ticket_id) ?? {}; return { id: q.id, ticketId: q.ticket_id, ticketTitle: titleOf.get(q.ticket_id) ?? 'Ticket', ticketStatus: rq.status ?? '', storeName: storeName.get(storeOf(q.ticket_id) ?? '') ?? (rq.company_id ? 'Store' : 'Individual'), branchCode: storeBranch.get(storeOf(q.ticket_id) ?? '') ?? null, amount: q.amount, amountInclVat: q.amount_incl_vat ?? null, status: q.status, createdAt: q.created_at, category: rq.category ?? null, priority: priorityOf(rq), jobRef: rq.job_ref ?? null, description: rq.description ?? null, validUntil: q.valid_until ?? null, proposedScheduleAt: q.proposed_schedule_at ?? null, reQuoteRequested: !!requoteAt.get(q.ticket_id) } }),
    // A completed ticket drops off the Sign-off tab entirely (nothing left to do).
    signoffs: (signoffsRaw ?? []).filter(s => (rawById.get(s.ticket_id)?.status) !== 'completed').map(s => { const rq: Partial<TicketRow> = rawById.get(s.ticket_id) ?? {}; return { id: s.id, ticketId: s.ticket_id, ticketTitle: titleOf.get(s.ticket_id) ?? 'Ticket', ticketStatus: rq.status ?? '', storeName: storeName.get(storeOf(s.ticket_id) ?? '') ?? (rq.company_id ? 'Store' : 'Individual'), branchCode: storeBranch.get(storeOf(s.ticket_id) ?? '') ?? null, status: s.status, createdAt: s.created_at, category: rq.category ?? null, priority: priorityOf(rq), description: rq.description ?? null, jobRef: rq.job_ref ?? null, photoCount: ((s.before_urls ?? []).length + (s.after_urls ?? []).length), certCount: (s.coc_url ? 1 : 0) + (s.invoice_url ? 1 : 0), decidedAt: s.reviewed_at ?? null, decidedBy: s.reviewed_by ? (reviewerName.get(s.reviewed_by) ?? null) : null } }),
    rating,
    generatedAt: now.toISOString(),
  }
}

function rank(r: RegionalHealthResult): number { return { controlled: 0, attention: 1, at_risk: 2, critical: 3 }[r.status] }
function storeRisk(s: StoreCard): number {
  const band = { controlled: 0, attention: 1, at_risk: 2, critical: 3 }[s.finalStatus]
  return band * 1000 + (100 - s.finalHealthScore) + s.safetyOpen * 20 + s.overdueTickets * 5 + s.pendingDecisions * 3
}
