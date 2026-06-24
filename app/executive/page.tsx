export const dynamic = 'force-dynamic'

import Link from 'next/link'
import {
  Building2, AlertTriangle, ClipboardList, Truck, ShieldAlert, FileText, Banknote,
  Repeat, Globe2, Gavel, ArrowRight, CheckCircle2, AlertCircle, BarChart3,
} from 'lucide-react'
import { requireExecutiveV3 } from '@/lib/health/guard'
import { assembleEstateDashboard, type TrendDelta } from '@/lib/health/data'
import { EstateHeader } from '@/components/exec/EstateHeader'
import {
  Card, SectionCard, KpiCard, Donut, Pill, DistributionBar, StoreDistributionDonut,
  DistributionLegend, TrendArrow, STATUS_TEXT, type Kpi, type Trend,
} from '@/components/exec/ui'
import { BriefingCard } from '@/components/briefing/BriefingCard'
import { getDailyBriefing } from '@/lib/briefing/generate'
import { estateFacts } from '@/lib/briefing/facts'
import { STATUS_LABELS } from '@/lib/health/constants'
import { formatCurrency, formatDate } from '@/lib/utils'

const fmtK = (n: number) => (n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n))
const tr = (d: TrendDelta): Trend | undefined => (d.dir === 'flat' ? undefined : { dir: d.dir, label: `${d.pct}%` })
const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
const quality = (s: number) => (s >= 90 ? 'Excellent' : s >= 80 ? 'Good' : s >= 60 ? 'Fair' : 'Poor')

const BAND: Record<'High' | 'Medium' | 'Low', string> = {
  High: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
  Medium: 'bg-[#C6A35D]/15 text-[#C6A35D] ring-1 ring-[#C6A35D]/30',
  Low: 'bg-slate-500/15 text-[var(--text-muted)] ring-1 ring-slate-500/30',
}

export default async function ExecutiveEstatePage() {
  const { companyId } = await requireExecutiveV3()
  const data = await assembleEstateDashboard(companyId)
  const e = data.estate
  const total = e.totalActiveStores
  const briefing = await getDailyBriefing({ companyId, scope: 'estate', scopeId: companyId, role: 'executive', facts: estateFacts(data) })

  const supplierBreachSuppliers = data.suppliers.filter(s => s.overdue > 0).length
  const regionAlerts = data.regions.filter(r => r.region.status !== 'controlled').length
  const actionableDecisions = data.decisions.filter(d => d.category !== 'Monitor')

  const suppliersDesc = [...data.suppliers].sort((a, b) => b.perf.performanceScore - a.perf.performanceScore)
  const bestSuppliers = suppliersDesc.slice(0, 3)
  const underSuppliers = [...data.suppliers]
    .sort((a, b) => a.perf.performanceScore - b.perf.performanceScore)
    .filter(s => s.perf.performanceScore < 80)
    .slice(0, 3)

  const kpis: Kpi[] = [
    { label: 'Stores', value: total, hint: `${data.totalRegions} regions`, icon: <Building2 size={13} />, href: '/executive/stores' },
    { label: 'Attention Stores', value: e.counts.attention, hint: `${pct(e.counts.attention, total)}% of estate`, icon: <AlertTriangle size={13} />, tone: e.counts.attention ? 'warn' : 'good', href: '/executive/stores' },
    { label: 'Open Work', value: e.openTickets, hint: 'vs last week', icon: <ClipboardList size={13} />, trend: tr(data.trends.openWork), href: '/executive/stores' },
    { label: 'Supplier Breaches', value: e.supplierSlaBreaches, hint: `${supplierBreachSuppliers} supplier${supplierBreachSuppliers === 1 ? '' : 's'}`, icon: <Truck size={13} />, tone: e.supplierSlaBreaches ? 'warn' : 'good', trend: tr(data.trends.supplierBreaches), href: '/executive/suppliers' },
    { label: 'Internal Breaches', value: e.internalSlaBreaches, hint: 'Across functions', icon: <ShieldAlert size={13} />, tone: e.internalSlaBreaches ? 'warn' : 'good', href: '/executive/decisions' },
    { label: 'Pending Approvals', value: e.decisionsPending, hint: `${fmtK(data.pendingDecisionValue)} backlog`, icon: <FileText size={13} />, href: '/executive/decisions' },
    { label: 'Cost Exposure', value: fmtK(e.costExposure), hint: 'High value items', icon: <Banknote size={13} />, trend: tr(data.trends.cost), href: '/executive/decisions' },
    { label: 'Repeat Defects', value: data.repeatDefects.length, hint: `${pct(data.repeatDefects.length, e.openTickets)}% of total work`, icon: <Repeat size={13} />, tone: data.repeatDefects.length ? 'warn' : 'good', href: '/executive/stores' },
    { label: 'Region Alerts', value: regionAlerts, hint: 'Requiring attention', icon: <Globe2 size={13} />, tone: regionAlerts ? 'warn' : 'good', href: '/executive/regions' },
    { label: 'Decisions Required', value: actionableDecisions.length, hint: 'Executive actions', icon: <Gavel size={13} />, tone: 'gold', href: '/executive/decisions' },
  ]

  return (
    <div className="space-y-5">
      <EstateHeader dateLabel={formatDate(data.generatedAt)} regions={data.regions.map(r => ({ id: r.region.regionId, name: r.regionName }))} />

      {/* AI morning briefing */}
      <BriefingCard briefing={briefing} />

      {/* Estate Health hero */}
      <Card className="p-6">
        <div className="flex flex-col lg:flex-row items-center gap-6">
          <Donut value={e.finalEstateHealth} status={e.status} size={140} label="Estate" />
          <div className="flex-1 min-w-0 w-full space-y-3 text-center lg:text-left">
            <div className="flex items-center justify-center lg:justify-start gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-[var(--text)]">Estate Health</h2>
              <Pill status={e.status} label={`${quality(e.finalEstateHealth)} / ${STATUS_LABELS[e.status]}`} />
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              Weighted estate health {e.weightedRegionalHealth}% − risk penalty {e.riskPenalty}% ={' '}
              <strong className={STATUS_TEXT[e.status]}>{e.finalEstateHealth}%</strong>. Main driver: <strong>{e.mainRiskDriver}</strong>.
            </p>
            <DistributionBar counts={e.counts} />
            <div className="flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-1 text-[11px]">
              <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className="w-2 h-2 rounded-full bg-emerald-500" />Controlled: {e.counts.controlled} ({pct(e.counts.controlled, total)}%)</span>
              <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className="w-2 h-2 rounded-full bg-[#C6A35D]" />Attention: {e.counts.attention} ({pct(e.counts.attention, total)}%)</span>
              <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className="w-2 h-2 rounded-full bg-red-400" />At Risk: {e.counts.at_risk} ({pct(e.counts.at_risk, total)}%)</span>
              <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className="w-2 h-2 rounded-full bg-red-800" />Critical: {e.counts.critical} ({pct(e.counts.critical, total)}%)</span>
            </div>
          </div>
        </div>
      </Card>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k, i) => <KpiCard key={i} kpi={k} />)}
      </div>

      {/* Ranking · distribution · risk */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-5 min-w-0">
          <SectionCard
            title="Regional Ranking — highest risk first"
            icon={<BarChart3 size={15} className="text-[#C6A35D]" />}
            action={<Link href="/executive/regions" className="text-xs text-[#C6A35D] hover:underline flex items-center gap-1">View all <ArrowRight size={12} /></Link>}
          >
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]">
                    <th className="py-2 px-2">#</th><th className="px-2">Region</th><th className="px-2">Health</th><th className="px-2">Trend</th>
                    <th className="px-2">Status</th><th className="px-2">Stores</th><th className="px-2">Red/Crit</th><th className="px-2">Open</th>
                    <th className="px-2">Cost</th><th className="px-2">Executive Note</th>
                  </tr>
                </thead>
                <tbody>
                  {data.regions.slice(0, 8).map(({ rank, region, regionName, trend }) => (
                    <tr key={region.regionId} className="border-b border-[var(--border)]">
                      <td className="py-2 px-2 text-[var(--text-faint)]">{rank}</td>
                      <td className="px-2 text-[var(--text)] whitespace-nowrap">{regionName}</td>
                      <td className={`px-2 font-semibold ${STATUS_TEXT[region.status]}`}>{region.finalPortfolioHealth}%</td>
                      <td className="px-2"><TrendArrow t={{ dir: trend.dir, label: `${trend.pct}%`, good: trend.dir === 'up' }} /></td>
                      <td className="px-2"><Pill status={region.status} /></td>
                      <td className="px-2 text-[var(--text-muted)]">{region.activeStores}</td>
                      <td className="px-2 text-[var(--text-muted)] tabular-nums">{region.counts.at_risk}/{region.counts.critical}</td>
                      <td className="px-2 text-[var(--text-muted)]">{region.openTickets}</td>
                      <td className="px-2 text-[var(--text-muted)] whitespace-nowrap">{fmtK(region.costExposure)}</td>
                      <td className="px-2 text-[var(--text-muted)] text-xs max-w-[180px] truncate">{region.mainReason}</td>
                    </tr>
                  ))}
                  {data.regions.length === 0 && <tr><td colSpan={10} className="py-4 px-2 text-[var(--text-faint)] text-center text-xs">No regions yet</td></tr>}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <div className="xl:col-span-3">
          <SectionCard title="Store Health Distribution">
            <div className="flex flex-col items-center gap-4">
              <StoreDistributionDonut counts={e.counts} />
              <div className="w-full"><DistributionLegend counts={e.counts} /></div>
              <Link href="/executive/stores" className="text-xs text-[#C6A35D] hover:underline">View full distribution</Link>
            </div>
          </SectionCard>
        </div>

        <div className="xl:col-span-4 min-w-0">
          <SectionCard
            title="Top Risk Stores"
            icon={<ShieldAlert size={15} className="text-red-400" />}
            action={<Link href="/executive/stores" className="text-xs text-[#C6A35D] hover:underline flex items-center gap-1">View all <ArrowRight size={12} /></Link>}
          >
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]">
                    <th className="py-2 px-2">#</th><th className="px-2">Store</th><th className="px-2">Health</th>
                    <th className="px-2">Main Risk</th><th className="px-2">Open</th><th className="px-2">Ovd</th><th className="px-2">Exposure</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topRiskStores.slice(0, 6).map((s, i) => (
                    <tr key={s.storeId} className="border-b border-[var(--border)]">
                      <td className="py-2 px-2 text-[var(--text-faint)]">{i + 1}</td>
                      <td className="px-2 text-[var(--text)] max-w-[140px] truncate">{s.storeName}<div className="text-[10px] text-[var(--text-faint)] truncate">{s.regionName}</div></td>
                      <td className={`px-2 font-semibold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</td>
                      <td className="px-2 text-[var(--text-muted)] text-xs max-w-[150px] truncate">{s.mainIssue}</td>
                      <td className="px-2 text-[var(--text-muted)]">{s.openTickets}</td>
                      <td className="px-2 text-[var(--text-muted)]">{s.overdueTickets}</td>
                      <td className="px-2 text-[var(--text-muted)] whitespace-nowrap">{fmtK(s.costExposure)}</td>
                    </tr>
                  ))}
                  {data.topRiskStores.length === 0 && <tr><td colSpan={7} className="py-4 px-2 text-[var(--text-faint)] text-center text-xs">No stores yet</td></tr>}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Performance + decisions + cost */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        <SectionCard title="Supplier Performance Overview" icon={<Truck size={15} className="text-[#C6A35D]" />}
          action={<Link href="/executive/suppliers" className="text-xs text-[#C6A35D] hover:underline">View all</Link>}>
          <div className="space-y-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-emerald-400 mb-2 flex items-center gap-1.5"><CheckCircle2 size={13} /> Best Performing</div>
              <div className="space-y-1.5">
                {bestSuppliers.map(s => (
                  <div key={s.id} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-muted)] truncate">{s.name}</span>
                    <span className="text-emerald-400 font-semibold tabular-nums">{s.perf.performanceScore}%</span>
                  </div>
                ))}
                {bestSuppliers.length === 0 && <p className="text-xs text-[var(--text-faint)]">No suppliers yet</p>}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-red-400 mb-2 flex items-center gap-1.5"><AlertCircle size={13} /> Underperforming</div>
              <div className="space-y-1.5">
                {underSuppliers.map(s => (
                  <div key={s.id} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-muted)] truncate">{s.name}</span>
                    <span className="text-red-400 font-semibold tabular-nums">{s.perf.performanceScore}%</span>
                  </div>
                ))}
                {underSuppliers.length === 0 && <p className="text-xs text-[var(--text-faint)]">None below threshold</p>}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Internal Performance Overview" icon={<ShieldAlert size={15} className="text-[#C6A35D]" />}>
          <div className="space-y-3">
            <KpiCard kpi={{ label: 'Approval Backlog', value: e.decisionsPending, hint: `${fmtK(data.pendingDecisionValue)} pending`, icon: <FileText size={13} /> }} />
            <KpiCard kpi={{ label: 'Internal SLA Pressure', value: e.internalSlaBreaches, hint: 'Across functions', tone: e.internalSlaBreaches ? 'warn' : 'good', trend: tr(data.trends.slaPressure) }} />
            <KpiCard kpi={{ label: 'Bottlenecks', value: e.criticalTickets, hint: 'Critical items requiring attention', tone: e.criticalTickets ? 'bad' : 'good' }} />
          </div>
        </SectionCard>

        <SectionCard title="Executive Decisions Required" icon={<Gavel size={15} className="text-[#C6A35D]" />}
          action={<Link href="/executive/decisions" className="text-xs text-[#C6A35D] hover:underline">View all</Link>}>
          <div className="space-y-2">
            {actionableDecisions.slice(0, 5).map((d, i) => (
              <div key={i} className="flex items-start justify-between gap-2 py-1.5 border-b border-[var(--border)] last:border-0">
                <div className="min-w-0">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${BAND[d.band]}`}>{d.band}</span>
                  <p className="text-xs text-[var(--text)] mt-1 truncate">{d.title}</p>
                </div>
                <div className="text-right shrink-0">
                  {d.exposureValue ? <p className="text-xs text-[var(--text)] whitespace-nowrap">{fmtK(d.exposureValue)}</p> : null}
                  <p className="text-[10px] text-[var(--text-faint)] whitespace-nowrap">Due in {d.deadlineDays}d</p>
                </div>
              </div>
            ))}
            {actionableDecisions.length === 0 && <p className="text-xs text-[var(--text-faint)]">No executive decisions outstanding</p>}
          </div>
        </SectionCard>

        <SectionCard title="Cost &amp; Exposure" icon={<Banknote size={15} className="text-[#C6A35D]" />}
          action={<Link href="/executive/decisions" className="text-xs text-[#C6A35D] hover:underline">Details</Link>}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <KpiCard kpi={{ label: 'Pending Quote Value', value: fmtK(data.pendingDecisionValue), hint: `${e.decisionsPending} quotes` }} />
              <KpiCard kpi={{ label: 'High Value Approvals', value: fmtK(data.highValueApprovals.value), hint: `${data.highValueApprovals.count} items` }} />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-2">Top Exposure Areas</div>
              <div className="space-y-1.5">
                {data.exposureBreakdown.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-muted)] truncate">{i + 1}. {b.label}</span>
                    <span className="text-[var(--text)] font-semibold whitespace-nowrap">{fmtK(b.value)}</span>
                  </div>
                ))}
                {data.exposureBreakdown.length === 0 && <p className="text-xs text-[var(--text-faint)]">No commercial exposure</p>}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
