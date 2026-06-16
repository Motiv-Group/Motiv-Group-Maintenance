export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Briefcase, ShieldAlert, Gavel, TrendingUp, Activity, ArrowRight,
} from 'lucide-react'
import { assembleEstateDashboard, type RegionRankRow } from '@/lib/dashboards/data'
import { PORTFOLIO_LABELS } from '@/lib/dashboards/constants'
import { HealthGauge, KpiGrid, DistributionBar, SectionCard, RagBadge, type KpiSpec } from '@/components/dashboards/primitives'
import { ResponsiveTable, type RTColumn } from '@/components/dashboards/ResponsiveTable'
import { formatCurrency } from '@/lib/utils'
import { DECISION_CHIP } from '@/components/dashboards/decisionChip'

export default async function ExecutiveDashboard() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
  if (profile?.role !== 'executive') redirect('/auth/login')

  const data = await assembleEstateDashboard()
  const e = data.estate

  const kpis: KpiSpec[] = [
    { label: 'Active Stores', value: e.totalActiveStores, hint: `${data.regions.length} regions`, accent: 'border-l-blue-500', href: '/executive/stores' },
    { label: 'Critical / Red Stores', value: `${e.counts.critical} / ${e.counts.red}`, hint: `${e.pctCritical}% critical`, accent: 'border-l-red-500', tone: e.counts.critical > 0 ? 'bad' : 'default' },
    { label: 'Open Tickets', value: e.openTickets, hint: `${e.criticalTickets} critical`, accent: 'border-l-amber-500', href: '/executive/stores' },
    { label: 'Supplier SLA Breaches', value: e.supplierSlaBreaches, accent: 'border-l-orange-500', tone: e.supplierSlaBreaches > 0 ? 'warn' : 'good', href: '/executive/suppliers' },
    { label: 'Internal SLA Breaches', value: e.internalSlaBreaches, accent: 'border-l-purple-500', tone: e.internalSlaBreaches > 0 ? 'warn' : 'good' },
    { label: 'Quotes Awaiting Approval', value: e.quotesAwaitingApproval, hint: formatCurrency(data.pendingQuoteValue), accent: 'border-l-yellow-500', tone: e.quotesAwaitingApproval > 0 ? 'warn' : 'default' },
    { label: 'Cost Exposure', value: formatCurrency(e.costExposure), accent: 'border-l-emerald-500' },
    { label: 'Repeat Defect Alerts', value: data.repeatDefects.length, accent: 'border-l-pink-500', tone: data.repeatDefects.length > 0 ? 'warn' : 'good' },
    { label: 'Top Risk Regions', value: e.regionsCritical + data.regions.filter(r => r.region.rag === 'red').length, accent: 'border-l-rose-500', href: '/executive/regions' },
    { label: 'Decisions Required', value: data.decisions.filter(d => d.category !== 'No action required').length, accent: 'border-l-indigo-500', href: '/executive/decisions' },
  ]

  const regionCols: RTColumn<RegionRankRow>[] = [
    { header: '#', hideMobile: true, cell: r => <span className="text-gray-400">{r.rank}</span> },
    { header: 'Region', role: 'title', cell: r => <span className="font-medium text-gray-900 dark:text-white">{r.regionName}</span> },
    { header: 'Health', role: 'badge', cell: r => <span className="font-semibold">{r.region.finalPortfolioHealth}%</span> },
    { header: 'Status', role: 'badge', cell: r => <RagBadge rag={r.region.rag} /> },
    { header: 'Stores', cell: r => r.region.activeStores },
    { header: 'Red/Crit', cell: r => `${r.region.counts.red}/${r.region.counts.critical}` },
    { header: 'Open', cell: r => r.region.openTickets },
    { header: 'Cost', cell: r => formatCurrency(r.region.costExposure) },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Briefcase size={22} className="text-brand-600 dark:text-brand-400" /> Executive Estate Dashboard
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Estate health hero */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <HealthGauge score={e.finalEstateHealth} rag={e.rag} label="Estate" />
          <div className="flex-1 min-w-0 text-center sm:text-left space-y-3">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <Activity size={18} className="text-brand-600 dark:text-brand-400" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Estate Health</h2>
              <RagBadge rag={e.rag} label={PORTFOLIO_LABELS[e.rag]} />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Weighted regional health {e.weightedRegionalHealth}% − risk penalty {e.riskPenalty}% = <strong>{e.finalEstateHealth}%</strong>.
              {' '}Main driver: <strong>{e.mainRiskDriver}</strong>.
            </p>
            {e.appliedPenalties.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {e.appliedPenalties.map((p, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{p}</span>
                ))}
              </div>
            )}
            <div className="pt-1">
              <DistributionBar counts={e.counts} />
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <KpiGrid specs={kpis} />

      {/* Regional ranking (preview) */}
      <SectionCard
        title="Regional Ranking — highest risk first"
        icon={<TrendingUp size={16} className="text-brand-600 dark:text-brand-300" />}
        action={<Link href="/executive/regions" className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">All regions <ArrowRight size={12} /></Link>}
      >
        <ResponsiveTable
          columns={regionCols}
          rows={data.regions.slice(0, 5)}
          getKey={r => r.region.regionId}
          minWidth={620}
          empty="No active regions yet."
        />
      </SectionCard>

      {/* Top risk stores (preview) */}
      <SectionCard
        title="Top Risk Stores"
        icon={<ShieldAlert size={16} className="text-red-500" />}
        action={<Link href="/executive/stores" className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">All stores <ArrowRight size={12} /></Link>}
      >
        {data.topRiskStores.length === 0 ? (
          <p className="text-sm text-gray-400">No stores under stress.</p>
        ) : (
          <ul className="space-y-2">
            {data.topRiskStores.slice(0, 6).map(({ rank, store }) => (
              <li key={store.storeId} className="flex items-center justify-between gap-3 border-b border-gray-50 dark:border-gray-700/50 pb-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">#{rank} {store.storeName}</p>
                  <p className="text-xs text-gray-400 truncate">{store.mainIssue}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold">{store.finalHealthScore}%</span>
                  <RagBadge rag={store.finalRag} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Executive decisions (preview) */}
      <SectionCard
        title="Executive Decisions Required"
        icon={<Gavel size={16} className="text-indigo-500" />}
        action={<Link href="/executive/decisions" className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">All decisions <ArrowRight size={12} /></Link>}
      >
        <ul className="space-y-2.5">
          {data.decisions.slice(0, 5).map((d, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${DECISION_CHIP[d.category]}`}>{d.category}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{d.decisionRequired}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{d.reason}</p>
                <p className="text-xs text-gray-400 mt-0.5">→ {d.recommendedAction} · {d.owner} · within {d.deadlineDays}d</p>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  )
}
