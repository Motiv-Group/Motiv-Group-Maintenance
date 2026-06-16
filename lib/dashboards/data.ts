// ============================================================
// Dashboards v2 — server-side data assembly
//
// Loads rows via the service-role client and runs the pure engine to produce
// ready-to-render payloads. Reused by Server Components, API routes and cron
// snapshot jobs so the numbers are identical everywhere.
//
// SERVER ONLY — imports the admin Supabase client.
// ============================================================
import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import type { Ticket, SlaRule, Priority } from '@/lib/types'
import { PRIORITIES } from './constants'
import { computeTicketSla, supplierBreachOlderThan, internalBreachOlderThan } from './sla'
import { calculateTicketHealth } from './ticketHealth'
import { calculateStoreHealth, type StoreHealthResult, type RuleResolver } from './storeHealth'
import { calculateRegionalPortfolioHealth, type RegionalHealthResult, type RegionalSignals } from './regionalHealth'
import { calculateExecutiveEstateHealth, type EstateHealthResult, type EstateTrendSignals } from './estateHealth'
import { calculateSupplierPerformance, type SupplierPerformance } from './supplierPerformance'
import { detectRepeatDefects, type RepeatDefect } from './repeatDefects'
import { getTopRiskStores, getRegionalRanking, type RankedStore } from './ranking'
import { getExecutiveDecisionItems, type DecisionItem } from './decisions'
import { THRESHOLDS } from './constants'

type DB = ReturnType<typeof createAdminClient>

const ACTIVE_STORE_ROLES = ['store_manager', 'client']
const TERMINAL = new Set(['completed', 'cancelled', 'declined'])
const DAY = 24 * 3600_000

// ── SLA rule resolution ──────────────────────────────────────
export interface RuleBook {
  for: (regionId: string | null, priority: Priority) => SlaRule
}

const FALLBACK_RULE: Omit<SlaRule, 'id' | 'region_id' | 'priority'> = {
  first_response_mins: 480, attendance_mins: 1440, resolution_mins: 5760,
  quote_review_mins: 1440, quote_approval_mins: 2880, instruction_mins: 1440,
  store_access_mins: 1440, escalation_response_mins: 480, completion_confirm_mins: 2880,
}

export async function loadRuleBook(db: DB): Promise<RuleBook> {
  const { data } = await db.from('sla_rules').select('*')
  const rules = (data ?? []) as SlaRule[]
  const key = (rid: string | null, p: Priority) => `${rid ?? 'global'}:${p}`
  const map = new Map<string, SlaRule>()
  for (const r of rules) map.set(key(r.region_id, r.priority), r)
  return {
    for: (regionId, priority) =>
      map.get(key(regionId, priority)) ??
      map.get(key(null, priority)) ??
      ({ id: 'fallback', region_id: regionId, priority, ...FALLBACK_RULE } as SlaRule),
  }
}

export function resolverFor(rules: RuleBook, regionId: string | null): RuleResolver {
  return (priority: Priority) => rules.for(regionId, priority)
}

// ── shared signal computation for a set of tickets ───────────
export function regionSignalsFor(
  tickets: Ticket[],
  stores: StoreHealthResult[],
  ruleFor: RuleResolver,
  now: Date,
): RegionalSignals {
  const active = tickets.filter(t => !TERMINAL.has(t.status))
  let criticalTicketOverdue = false
  let supplierBreachOver3dCount = 0
  let internalBreachOver3dCount = 0
  let quoteApprovalBacklog = 0
  let missingCriticalUpdates = false
  let overdueTickets = 0
  let costExposure = 0

  for (const t of active) {
    const rule = ruleFor(t.priority)
    const sla = computeTicketSla(t, rule, now)
    if (sla.supplierBreached || sla.internalBreached) overdueTickets++
    if (t.severity === 'critical' && (sla.supplierBreached || sla.internalBreached)) criticalTicketOverdue = true
    if (sla.currentBlocker === 'quote_approval') quoteApprovalBacklog++
    if (supplierBreachOlderThan(t, rule, 3, now)) supplierBreachOver3dCount++
    if (internalBreachOlderThan(t, rule, 3, now)) internalBreachOver3dCount++
    if (t.severity === 'critical') {
      const ref = t.last_supplier_update_at ?? t.last_internal_update_at ?? t.updated_at
      if (now.getTime() - new Date(ref).getTime() > THRESHOLDS.criticalStaleHours * 3600_000) missingCriticalUpdates = true
    }
    costExposure += t.quote_value ?? 0
  }

  // repeat defects spanning ≥2 distinct stores in this set
  const repeats = detectRepeatDefects(tickets, THRESHOLDS.repeatWindowDays, now)
  const repeatStores = new Set(repeats.map(r => r.storeId))
  const repeatDefectAcrossStores = repeatStores.size >= 2

  return {
    criticalTicketOverdue,
    supplierBreachOver3dCount,
    internalBreachOver3dCount,
    repeatDefectAcrossStores,
    quoteApprovalBacklog,
    missingCriticalUpdates,
    openTickets: active.length,
    overdueTickets,
    costExposure,
  }
}

// ── store name helpers ───────────────────────────────────────
export function storeLabel(p: any): string {
  return [p?.company_name, p?.sub_store].filter(Boolean).join(' — ') || 'Store'
}

// ============================================================
// REGIONAL DASHBOARD
// ============================================================
export interface TicketActionRow {
  id: string
  jobNumber: number | null
  storeId: string
  storeName: string
  priority: Priority
  category: string | null
  ageDays: number
  slaLabel: string
  currentBlocker: string | null
  blockerOwner: string | null
  nextAction: string
  nextActionDueAt: string | null
  healthScore: number
}

export interface InternalBacklogRow {
  ticketId: string
  storeName: string
  action: string
  owner: string | null
  daysWaiting: number
  internalBreached: boolean
}

export interface StoreCard extends StoreHealthResult {
  storeName: string
  subStore: string | null
}

export interface RegionalDashboardData {
  regionIds: string[]
  regionNames: string[]
  portfolio: RegionalHealthResult
  stores: StoreCard[]
  attentionStores: StoreCard[]
  healthyStores: StoreCard[]
  topRiskStores: RankedStore<StoreCard>[]
  ticketActions: TicketActionRow[]
  internalBacklog: InternalBacklogRow[]
  suppliers: { id: string; name: string; perf: SupplierPerformance }[]
  repeatDefects: (RepeatDefect & { storeName: string })[]
  quotesAwaitingApproval: number
  pendingQuoteValue: number
  highValueApprovals: { ticketId: string; storeName: string; value: number; daysWaiting: number }[]
  generatedAt: string
}

export async function assembleRegionalDashboard(rmUserId: string, now: Date = new Date()): Promise<RegionalDashboardData> {
  const db = createAdminClient()
  const rules = await loadRuleBook(db)

  const { data: regions } = await db.from('regions').select('id, name').eq('regional_manager_id', rmUserId)
  const regionIds = (regions ?? []).map(r => r.id)

  // Stores: prefer region membership, fall back to legacy regional_manager_id link.
  const storeQuery = db.from('profiles')
    .select('id, company_name, sub_store, region_id, regional_manager_id, closed_at, role')
    .in('role', ACTIVE_STORE_ROLES)
    .is('closed_at', null)
  const { data: storesRaw } = regionIds.length
    ? await storeQuery.or(`region_id.in.(${regionIds.join(',')}),regional_manager_id.eq.${rmUserId}`)
    : await storeQuery.eq('regional_manager_id', rmUserId)

  const stores = (storesRaw ?? []) as any[]
  const storeIds = stores.map(s => s.id)
  const storeById = new Map(stores.map(s => [s.id, s]))

  const { data: ticketsRaw } = storeIds.length
    ? await db.from('tickets').select('*').in('client_id', storeIds)
    : { data: [] as any[] }
  const tickets = (ticketsRaw ?? []) as Ticket[]

  const { data: suppliersRaw } = await db.from('suppliers').select('id, company_name, trade')
  const supplierName = new Map((suppliersRaw ?? []).map((s: any) => [s.id, s.company_name]))

  // tickets grouped by store
  const ticketsByStore = new Map<string, Ticket[]>()
  for (const t of tickets) {
    const arr = ticketsByStore.get(t.client_id) ?? []
    arr.push(t); ticketsByStore.set(t.client_id, arr)
  }

  // primary region for resolver (first managed region or null → global rules)
  const primaryRegion = regionIds[0] ?? null
  const ruleFor = resolverFor(rules, primaryRegion)

  // per-store health
  const storeCards: StoreCard[] = stores.map(s => {
    const res = calculateStoreHealth({ id: s.id, region_id: s.region_id }, ticketsByStore.get(s.id) ?? [], resolverFor(rules, s.region_id ?? primaryRegion), now)
    return { ...res, storeName: storeLabel(s), subStore: s.sub_store ?? null }
  })

  const signals = regionSignalsFor(tickets, storeCards, ruleFor, now)
  const portfolio = calculateRegionalPortfolioHealth(primaryRegion ?? 'region', storeCards, signals)

  const attentionStores = [...storeCards]
    .filter(s => s.finalRag !== 'green')
    .sort((a, b) => (b.criticalOpen - a.criticalOpen) || (a.finalHealthScore - b.finalHealthScore))
  const healthyStores = [...storeCards].filter(s => s.finalRag === 'green').sort((a, b) => b.finalHealthScore - a.finalHealthScore)
  const topRiskStores = getTopRiskStores(storeCards, 10)

  // ticket action list — active tickets needing attention
  const ticketActions: TicketActionRow[] = tickets
    .filter(t => !TERMINAL.has(t.status))
    .map(t => {
      const h = calculateTicketHealth(t, ruleFor(t.priority), now)
      return {
        id: t.id, jobNumber: t.job_number ?? null,
        storeId: t.client_id, storeName: storeLabel(storeById.get(t.client_id)),
        priority: t.priority, category: t.category ?? null,
        ageDays: Math.floor((now.getTime() - new Date(t.created_at).getTime()) / DAY),
        slaLabel: h.status, currentBlocker: h.sla.currentBlocker,
        blockerOwner: h.sla.blockerOwnerType, nextAction: h.sla.nextAction,
        nextActionDueAt: h.sla.nextActionDueAt, healthScore: h.score,
      }
    })
    .sort((a, b) => a.healthScore - b.healthScore)

  // internal action backlog
  const internalBacklog: InternalBacklogRow[] = tickets
    .filter(t => !TERMINAL.has(t.status))
    .map(t => ({ t, sla: computeTicketSla(t, ruleFor(t.priority), now) }))
    .filter(x => x.sla.internalStatus === 'running')
    .map(({ t, sla }) => ({
      ticketId: t.id, storeName: storeLabel(storeById.get(t.client_id)),
      action: sla.nextAction, owner: sla.blockerOwnerType,
      daysWaiting: sla.daysWithBlocker ?? 0, internalBreached: sla.internalBreached,
    }))
    .sort((a, b) => b.daysWaiting - a.daysWaiting)

  // supplier performance within region
  const bySupplier = new Map<string, Ticket[]>()
  for (const t of tickets) if (t.supplier_id) {
    const arr = bySupplier.get(t.supplier_id) ?? []; arr.push(t); bySupplier.set(t.supplier_id, arr)
  }
  const suppliers = [...bySupplier.entries()].map(([id, ts]) => ({
    id, name: supplierName.get(id) ?? 'Supplier', perf: calculateSupplierPerformance(id, ts, ruleFor, now),
  })).sort((a, b) => a.perf.performanceScore - b.perf.performanceScore)

  // repeat defects
  const repeatDefects = detectRepeatDefects(tickets, THRESHOLDS.repeatWindowDays, now)
    .map(r => ({ ...r, storeName: storeLabel(storeById.get(r.storeId)) }))

  // quotes awaiting approval + value
  const approvalTickets = tickets.filter(t => !TERMINAL.has(t.status) && computeTicketSla(t, ruleFor(t.priority), now).currentBlocker === 'quote_approval')
  const quotesAwaitingApproval = approvalTickets.length
  const pendingQuoteValue = approvalTickets.reduce((s, t) => s + (t.quote_value ?? 0), 0)
  const highValueApprovals = approvalTickets
    .map(t => ({
      ticketId: t.id, storeName: storeLabel(storeById.get(t.client_id)),
      value: t.quote_value ?? 0,
      daysWaiting: computeTicketSla(t, ruleFor(t.priority), now).daysWithBlocker ?? 0,
    }))
    .filter(a => a.value >= THRESHOLDS.highValueQuote)
    .sort((a, b) => b.value - a.value)

  return {
    regionIds, regionNames: (regions ?? []).map(r => r.name),
    portfolio, stores: storeCards, attentionStores, healthyStores, topRiskStores,
    ticketActions, internalBacklog, suppliers, repeatDefects,
    quotesAwaitingApproval, pendingQuoteValue, highValueApprovals,
    generatedAt: now.toISOString(),
  }
}

// ============================================================
// EXECUTIVE / ESTATE DASHBOARD
// ============================================================
export interface RegionRankRow {
  rank: number
  region: RegionalHealthResult
  regionName: string
}

export interface EstateDashboardData {
  estate: EstateHealthResult
  regions: RegionRankRow[]
  topRiskStores: RankedStore<StoreCard>[]
  amberStores: StoreCard[]
  controlledStores: StoreCard[]
  suppliers: { id: string; name: string; perf: SupplierPerformance }[]
  repeatDefects: (RepeatDefect & { storeName: string; regionName: string })[]
  decisions: DecisionItem[]
  pendingQuoteValue: number
  generatedAt: string
}

export async function assembleEstateDashboard(now: Date = new Date()): Promise<EstateDashboardData> {
  const db = createAdminClient()
  const rules = await loadRuleBook(db)

  const [{ data: regionsRaw }, { data: storesRaw }, { data: ticketsRaw }, { data: suppliersRaw }] = await Promise.all([
    db.from('regions').select('id, name').eq('active', true),
    db.from('profiles').select('id, company_name, sub_store, region_id, regional_manager_id, closed_at, role').in('role', ACTIVE_STORE_ROLES).is('closed_at', null),
    db.from('tickets').select('*'),
    db.from('suppliers').select('id, company_name, trade'),
  ])

  const regionsList = (regionsRaw ?? []) as any[]
  const regionName = new Map(regionsList.map(r => [r.id, r.name]))
  const stores = (storesRaw ?? []) as any[]
  const storeById = new Map(stores.map(s => [s.id, s]))
  const tickets = (ticketsRaw ?? []) as Ticket[]
  const supplierName = new Map((suppliersRaw ?? []).map((s: any) => [s.id, s.company_name]))

  const ticketsByStore = new Map<string, Ticket[]>()
  for (const t of tickets) {
    const arr = ticketsByStore.get(t.client_id) ?? []; arr.push(t); ticketsByStore.set(t.client_id, arr)
  }

  // all store cards
  const allCards: StoreCard[] = stores.map(s => {
    const res = calculateStoreHealth({ id: s.id, region_id: s.region_id }, ticketsByStore.get(s.id) ?? [], resolverFor(rules, s.region_id), now)
    return { ...res, storeName: storeLabel(s), subStore: s.sub_store ?? null }
  })

  // group by region
  const cardsByRegion = new Map<string, StoreCard[]>()
  const ticketsByRegion = new Map<string, Ticket[]>()
  for (const c of allCards) {
    const rid = c.regionId ?? 'unassigned'
    const arr = cardsByRegion.get(rid) ?? []; arr.push(c); cardsByRegion.set(rid, arr)
  }
  for (const t of tickets) {
    const rid = t.region_id ?? storeById.get(t.client_id)?.region_id ?? 'unassigned'
    const arr = ticketsByRegion.get(rid) ?? []; arr.push(t); ticketsByRegion.set(rid, arr)
  }

  const regionResults: RegionalHealthResult[] = []
  for (const rid of new Set([...cardsByRegion.keys()])) {
    const cards = cardsByRegion.get(rid) ?? []
    const regionTickets = ticketsByRegion.get(rid) ?? []
    const ruleFor = resolverFor(rules, rid === 'unassigned' ? null : rid)
    const signals = regionSignalsFor(regionTickets, cards, ruleFor, now)
    regionResults.push(calculateRegionalPortfolioHealth(rid, cards, signals))
  }

  // estate trend signals — current values; trend booleans require yesterday's
  // snapshot (filled by cron). Here we approximate "increasing" as false on
  // first run and let the cron job set real trend flags.
  const activeTickets = tickets.filter(t => !TERMINAL.has(t.status))
  const criticalTickets = activeTickets.filter(t => t.severity === 'critical').length
  const pendingQuoteValue = activeTickets.reduce((s, t) => s + (t.quote_value ?? 0), 0)
  let supplierSlaBreaches = 0, internalSlaBreaches = 0, quotesAwaiting = 0, criticalOverdue = false
  for (const t of activeTickets) {
    const sla = computeTicketSla(t, rules.for(t.region_id ?? null, t.priority), now)
    if (sla.supplierBreached) supplierSlaBreaches++
    if (sla.internalBreached) internalSlaBreaches++
    if (sla.currentBlocker === 'quote_approval') quotesAwaiting++
    if (t.severity === 'critical' && (sla.supplierBreached || sla.internalBreached)) criticalOverdue = true
  }

  const trend = await estateTrendFlags(db, { supplierSlaBreaches, internalSlaBreaches, quotesAwaiting }, now)

  const estateSignals: EstateTrendSignals = {
    ...trend,
    criticalTicketOverdue: criticalOverdue,
    costExposure: pendingQuoteValue,
    openTickets: activeTickets.length,
    criticalTickets,
    quotesAwaitingApproval: quotesAwaiting,
    supplierSlaBreaches,
    internalSlaBreaches,
  }
  const estate = calculateExecutiveEstateHealth(regionResults, estateSignals)

  const ranking = getRegionalRanking(regionResults)
    .map(r => ({ ...r, regionName: regionName.get(r.region.regionId) ?? (r.region.regionId === 'unassigned' ? 'Unassigned' : 'Region') }))

  const topRiskStores = getTopRiskStores(allCards, 10)
  const amberStores = allCards.filter(c => c.finalRag === 'amber').sort((a, b) => a.finalHealthScore - b.finalHealthScore)
  const controlledStores = allCards.filter(c => c.finalRag === 'green').sort((a, b) => b.finalHealthScore - a.finalHealthScore)

  // estate-wide supplier performance
  const bySupplier = new Map<string, Ticket[]>()
  for (const t of tickets) if (t.supplier_id) { const a = bySupplier.get(t.supplier_id) ?? []; a.push(t); bySupplier.set(t.supplier_id, a) }
  const suppliers = [...bySupplier.entries()].map(([id, ts]) => ({
    id, name: supplierName.get(id) ?? 'Supplier', perf: calculateSupplierPerformance(id, ts, (p) => rules.for(null, p), now),
  })).sort((a, b) => a.perf.performanceScore - b.perf.performanceScore)

  const repeatDefects = detectRepeatDefects(tickets, THRESHOLDS.repeatWindowDays, now)
    .map(r => ({ ...r, storeName: storeLabel(storeById.get(r.storeId)), regionName: regionName.get(r.regionId ?? '') ?? 'Region' }))

  const highValueApprovals = activeTickets
    .filter(t => computeTicketSla(t, rules.for(t.region_id ?? null, t.priority), now).currentBlocker === 'quote_approval')
    .map(t => ({ ticketId: t.id, storeName: storeLabel(storeById.get(t.client_id)), value: t.quote_value ?? 0, daysWaiting: computeTicketSla(t, rules.for(t.region_id ?? null, t.priority), now).daysWithBlocker ?? 0 }))
    .filter(a => a.value >= THRESHOLDS.highValueQuote)
    .sort((a, b) => b.value - a.value)

  const decisions = getExecutiveDecisionItems({
    topRiskStores, regions: regionResults, repeatDefects, suppliers,
    pendingApprovalValue: pendingQuoteValue, highValueApprovals,
    storeName: (id) => storeLabel(storeById.get(id)),
    regionName: (id) => regionName.get(id) ?? 'Region',
  })

  return { estate, regions: ranking, topRiskStores, amberStores, controlledStores, suppliers, repeatDefects, decisions, pendingQuoteValue, generatedAt: now.toISOString() }
}

/** Compare today's live counts to yesterday's estate snapshot for trend flags. */
async function estateTrendFlags(
  db: DB,
  today: { supplierSlaBreaches: number; internalSlaBreaches: number; quotesAwaiting: number },
  now: Date,
): Promise<Pick<EstateTrendSignals, 'supplierSlaTrendUp' | 'internalSlaTrendUp' | 'quoteBacklogTrendUp' | 'repeatDefectsTrendUp'>> {
  const yesterday = new Date(now.getTime() - DAY).toISOString().slice(0, 10)
  const { data } = await db.from('executive_estate_health_scores').select('*').eq('snapshot_date', yesterday).maybeSingle()
  if (!data) return { supplierSlaTrendUp: false, internalSlaTrendUp: false, quoteBacklogTrendUp: false, repeatDefectsTrendUp: false }
  return {
    supplierSlaTrendUp: today.supplierSlaBreaches > (data.supplier_sla_breaches ?? 0),
    internalSlaTrendUp: today.internalSlaBreaches > (data.internal_sla_breaches ?? 0),
    quoteBacklogTrendUp: today.quotesAwaiting > (data.quotes_awaiting_approval ?? 0),
    repeatDefectsTrendUp: false,
  }
}
