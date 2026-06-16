// ============================================================
// MOTIV v3 — daily health snapshots (server-only)
// Writes store / regional / estate / supplier health per company so trend
// arrows + month-end reports have history. Dashboards still compute live.
// ============================================================
import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { assembleEstateDashboard } from './data'

export interface SnapshotSummary { companies: number; stores: number; regions: number; date: string }

export async function runEstateSnapshots(now: Date = new Date()): Promise<SnapshotSummary> {
  const db = createAdminClient()
  const date = now.toISOString().slice(0, 10)
  const { data: companies } = await db.from('companies').select('id').eq('active', true)
  let storeN = 0, regionN = 0

  for (const c of (companies ?? []) as { id: string }[]) {
    const d = await assembleEstateDashboard(c.id, now)

    // stores
    const storeRows = d.stores.map(s => ({
      company_id: c.id, store_id: s.storeId, region_id: s.regionId, snapshot_date: date,
      operational_risk_score: s.breakdown.operationalRisk, sla_score: s.breakdown.sla, ticket_load_score: s.breakdown.ticketLoad,
      repeat_defect_score: s.breakdown.repeatDefect, commercial_blocker_score: s.breakdown.commercialBlocker, data_quality_score: s.breakdown.dataQuality,
      calculated_health_score: s.calculatedHealthScore, calculated_status: s.calculatedStatus,
      override_applied: s.overrideApplied, override_reason: s.overrideReason,
      final_health_score: s.finalHealthScore, final_status: s.finalStatus,
      open_tickets: s.openTickets, overdue_tickets: s.overdueTickets, main_issue: s.mainIssue,
    }))
    if (storeRows.length) await db.from('store_health_scores').upsert(storeRows, { onConflict: 'store_id,snapshot_date' })
    storeN += storeRows.length

    // regions
    const regionRows = d.regions.map(r => ({
      company_id: c.id, region_id: r.region.regionId, snapshot_date: date,
      average_store_health: r.region.averageStoreHealth, risk_penalty: r.region.riskPenalty,
      final_portfolio_health: r.region.finalPortfolioHealth, status: r.region.status,
      active_stores: r.region.activeStores, controlled_count: r.region.counts.controlled, attention_count: r.region.counts.attention,
      at_risk_count: r.region.counts.at_risk, critical_count: r.region.counts.critical,
      open_tickets: r.region.openTickets, overdue_tickets: r.region.overdueTickets,
      supplier_sla_breaches: r.region.supplierSlaBreaches, internal_sla_breaches: r.region.internalSlaBreaches,
      cost_exposure: r.region.costExposure, main_reason: r.region.mainReason,
    }))
    if (regionRows.length) await db.from('regional_health_scores').upsert(regionRows, { onConflict: 'region_id,snapshot_date' })
    regionN += regionRows.length

    // estate
    const e = d.estate
    await db.from('estate_health_scores').upsert([{
      company_id: c.id, snapshot_date: date,
      weighted_regional_health: e.weightedRegionalHealth, risk_penalty: e.riskPenalty, final_estate_health: e.finalEstateHealth, status: e.status,
      total_active_stores: e.totalActiveStores, controlled_count: e.counts.controlled, attention_count: e.counts.attention,
      at_risk_count: e.counts.at_risk, critical_count: e.counts.critical,
      open_tickets: e.openTickets, critical_tickets: e.criticalTickets,
      supplier_sla_breaches: e.supplierSlaBreaches, internal_sla_breaches: e.internalSlaBreaches,
      decisions_pending: e.decisionsPending, cost_exposure: e.costExposure, main_risk_driver: e.mainRiskDriver,
    }], { onConflict: 'company_id,snapshot_date' })

    // suppliers (no unique → clear today then insert)
    await db.from('supplier_performance_scores').delete().eq('company_id', c.id).eq('snapshot_date', date).is('region_id', null)
    const supRows = d.suppliers.map(s => ({
      company_id: c.id, supplier_id: s.id, region_id: null, snapshot_date: date,
      assigned_tickets: s.perf.assignedTickets, completed_tickets: s.perf.completedTickets, sla_breaches: s.perf.slaBreaches,
      avg_response_mins: s.perf.avgResponseMins, avg_resolution_mins: s.perf.avgResolutionMins, first_time_fix_rate: s.perf.firstTimeFixRate,
      repeat_defect_involvement: s.perf.repeatDefectInvolvement, evidence_completion_rate: s.perf.evidenceCompletionRate,
      escalation_count: s.perf.escalationCount, performance_score: s.perf.performanceScore, performance_band: s.perf.band,
    }))
    if (supRows.length) await db.from('supplier_performance_scores').insert(supRows)
  }

  return { companies: (companies ?? []).length, stores: storeN, regions: regionN, date }
}
