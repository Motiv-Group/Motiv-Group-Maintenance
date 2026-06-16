// ============================================================
// Dashboards v2 — daily snapshot job (spec §14)
//
// Recomputes store / regional / estate / supplier health and persists a dated
// snapshot row per scope. Snapshots power trend arrows ("vs last week") and
// month-end reporting; the live dashboards still compute on the fly, so the
// app works even before the first snapshot runs.
//
// SERVER ONLY.
// ============================================================
import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import type { Ticket } from '@/lib/types'
import { loadRuleBook, resolverFor, regionSignalsFor, storeLabel, assembleEstateDashboard } from './data'
import { calculateStoreHealth, type StoreHealthResult } from './storeHealth'
import { calculateRegionalPortfolioHealth, type RegionalHealthResult } from './regionalHealth'
import { calculateExecutiveEstateHealth, type EstateTrendSignals } from './estateHealth'
import { calculateSupplierPerformance } from './supplierPerformance'
import { detectRepeatDefects } from './repeatDefects'
import { computeTicketSla } from './sla'
import { THRESHOLDS } from './constants'

const ACTIVE_STORE_ROLES = ['store_manager', 'client']
const TERMINAL = new Set(['completed', 'cancelled', 'declined'])

export interface SnapshotSummary {
  date: string
  stores: number
  regions: number
  suppliers: number
  estateHealth: number
}

export async function runDailySnapshots(now: Date = new Date()): Promise<SnapshotSummary> {
  const db = createAdminClient()
  const rules = await loadRuleBook(db)
  const date = now.toISOString().slice(0, 10)

  const [{ data: regionsRaw }, { data: storesRaw }, { data: ticketsRaw }] = await Promise.all([
    db.from('regions').select('id, name').eq('active', true),
    db.from('profiles').select('id, company_name, sub_store, region_id, role, closed_at').in('role', ACTIVE_STORE_ROLES).is('closed_at', null),
    db.from('tickets').select('*'),
  ])

  const stores = (storesRaw ?? []) as any[]
  const tickets = (ticketsRaw ?? []) as Ticket[]

  const ticketsByStore = new Map<string, Ticket[]>()
  for (const t of tickets) { const a = ticketsByStore.get(t.client_id) ?? []; a.push(t); ticketsByStore.set(t.client_id, a) }

  // ── store health ──
  const cards: StoreHealthResult[] = stores.map(s =>
    calculateStoreHealth({ id: s.id, region_id: s.region_id }, ticketsByStore.get(s.id) ?? [], resolverFor(rules, s.region_id), now))

  const storeRows = cards.map(c => ({
    store_id: c.storeId, region_id: c.regionId, snapshot_date: date,
    operational_risk_score: c.breakdown.operationalRisk, sla_score: c.breakdown.sla,
    ticket_load_score: c.breakdown.ticketLoad, repeat_defect_score: c.breakdown.repeatDefect,
    commercial_blocker_score: c.breakdown.commercialBlocker, data_quality_score: c.breakdown.dataQuality,
    calculated_health_score: c.calculatedHealthScore, calculated_rag_status: c.calculatedRag,
    override_applied: c.overrideApplied, override_reason: c.overrideReason,
    final_health_score: c.finalHealthScore, final_rag_status: c.finalRag,
    open_tickets: c.openTickets, overdue_tickets: c.overdueTickets, main_issue: c.mainIssue,
  }))
  if (storeRows.length) await db.from('store_health_scores').upsert(storeRows, { onConflict: 'store_id,snapshot_date' })

  // ── regional health (skip the synthetic 'unassigned' bucket) ──
  const cardsByRegion = new Map<string, StoreHealthResult[]>()
  const ticketsByRegion = new Map<string, Ticket[]>()
  for (const c of cards) { const rid = c.regionId ?? 'unassigned'; const a = cardsByRegion.get(rid) ?? []; a.push(c); cardsByRegion.set(rid, a) }
  for (const t of tickets) { const rid = t.region_id ?? 'unassigned'; const a = ticketsByRegion.get(rid) ?? []; a.push(t); ticketsByRegion.set(rid, a) }

  const regionResults: RegionalHealthResult[] = []
  for (const rid of Array.from(cardsByRegion.keys())) {
    const ruleFor = resolverFor(rules, rid === 'unassigned' ? null : rid)
    const signals = regionSignalsFor(ticketsByRegion.get(rid) ?? [], cardsByRegion.get(rid) ?? [], ruleFor, now)
    regionResults.push(calculateRegionalPortfolioHealth(rid, cardsByRegion.get(rid) ?? [], signals))
  }
  const regionalRows = regionResults
    .filter(r => r.regionId !== 'unassigned')
    .map(r => ({
      region_id: r.regionId, snapshot_date: date,
      average_store_health: r.averageStoreHealth, risk_penalty: r.riskPenalty,
      final_portfolio_health: r.finalPortfolioHealth, rag_status: r.rag,
      active_stores: r.activeStores, green_count: r.counts.green, amber_count: r.counts.amber,
      red_count: r.counts.red, critical_count: r.counts.critical,
      open_tickets: r.openTickets, overdue_tickets: r.overdueTickets,
      supplier_sla_breaches: r.supplierSlaBreaches, internal_sla_breaches: r.internalSlaBreaches,
      cost_exposure: r.costExposure, main_reason: r.mainReason,
    }))
  if (regionalRows.length) await db.from('regional_health_scores').upsert(regionalRows, { onConflict: 'region_id,snapshot_date' })

  // ── estate health ──
  const active = tickets.filter(t => !TERMINAL.has(t.status))
  let supplierSlaBreaches = 0, internalSlaBreaches = 0, quotesAwaiting = 0, criticalOverdue = false
  for (const t of active) {
    const sla = computeTicketSla(t, rules.for(t.region_id ?? null, t.priority), now)
    if (sla.supplierBreached) supplierSlaBreaches++
    if (sla.internalBreached) internalSlaBreaches++
    if (sla.currentBlocker === 'quote_approval') quotesAwaiting++
    if (t.severity === 'critical' && (sla.supplierBreached || sla.internalBreached)) criticalOverdue = true
  }
  const costExposure = active.reduce((s, t) => s + (t.quote_value ?? 0), 0)
  const estateSignals: EstateTrendSignals = {
    supplierSlaTrendUp: false, internalSlaTrendUp: false, quoteBacklogTrendUp: false, repeatDefectsTrendUp: false,
    criticalTicketOverdue: criticalOverdue, costExposure,
    openTickets: active.length, criticalTickets: active.filter(t => t.severity === 'critical').length,
    quotesAwaitingApproval: quotesAwaiting, supplierSlaBreaches, internalSlaBreaches,
  }
  const estate = calculateExecutiveEstateHealth(regionResults, estateSignals)
  await db.from('executive_estate_health_scores').upsert([{
    snapshot_date: date,
    weighted_regional_health: estate.weightedRegionalHealth, risk_penalty: estate.riskPenalty,
    final_estate_health: estate.finalEstateHealth, rag_status: estate.rag,
    total_active_stores: estate.totalActiveStores, green_count: estate.counts.green, amber_count: estate.counts.amber,
    red_count: estate.counts.red, critical_count: estate.counts.critical,
    open_tickets: estate.openTickets, critical_tickets: estate.criticalTickets,
    supplier_sla_breaches: estate.supplierSlaBreaches, internal_sla_breaches: estate.internalSlaBreaches,
    quotes_awaiting_approval: estate.quotesAwaitingApproval, cost_exposure: estate.costExposure,
    main_risk_driver: estate.mainRiskDriver,
  }], { onConflict: 'snapshot_date' })

  // ── supplier performance (estate-wide) ──
  const bySupplier = new Map<string, Ticket[]>()
  for (const t of tickets) if (t.supplier_id) { const a = bySupplier.get(t.supplier_id) ?? []; a.push(t); bySupplier.set(t.supplier_id, a) }
  const supplierRows = Array.from(bySupplier.entries()).map(([id, ts]) => {
    const perf = calculateSupplierPerformance(id, ts, (p) => rules.for(null, p), now)
    return {
      supplier_id: id, region_id: null, snapshot_date: date,
      assigned_tickets: perf.assignedTickets, completed_tickets: perf.completedTickets,
      sla_breaches: perf.slaBreaches, avg_response_mins: perf.avgResponseMins, avg_resolution_mins: perf.avgResolutionMins,
      first_time_fix_rate: perf.firstTimeFixRate, repeat_defect_involvement: perf.repeatDefectInvolvement,
      evidence_completion_rate: perf.evidenceCompletionRate, escalation_count: perf.escalationCount,
      performance_score: perf.performanceScore, performance_band: perf.band,
    }
  })
  // no unique constraint on supplier_performance_scores → clear today then insert
  await db.from('supplier_performance_scores').delete().eq('snapshot_date', date).is('region_id', null)
  if (supplierRows.length) await db.from('supplier_performance_scores').insert(supplierRows)

  // ── full estate view payload for fast dashboard loads / month-end report ──
  const estateView = await assembleEstateDashboard(now)
  await db.from('dashboard_snapshots').insert([{ scope: 'estate', scope_id: null, snapshot_date: date, payload: estateView as any }])

  return { date, stores: storeRows.length, regions: regionalRows.length, suppliers: supplierRows.length, estateHealth: estate.finalEstateHealth }
}
