export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Globe2, Building2, ClipboardList, ShieldAlert, Banknote, Repeat, Gavel, Truck, ArrowRight } from 'lucide-react'
import { requireExecutiveV3 } from '@/lib/health/guard'
import { assembleEstateDashboard, type TrendDelta } from '@/lib/health/data'
import { Card, SectionCard, KpiRow, Donut, Pill, DistributionBar, DistributionChips, STATUS_TEXT, type Kpi, type Trend } from '@/components/exec/ui'

const tr = (d: TrendDelta): Trend | undefined => d.dir === 'flat' ? undefined : { dir: d.dir, label: `${d.pct}%` }
import { STATUS_LABELS } from '@/lib/health/constants'
import { formatCurrency } from '@/lib/utils'

const fmtK = (n: number) => n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n)

export default async function ExecutiveEstatePage() {
  const { companyId, fullName } = await requireExecutiveV3()
  const data = await assembleEstateDashboard(companyId)
  const e = data.estate

  const kpis: Kpi[] = [
    { label: 'Active Stores', value: e.totalActiveStores, hint: `${data.regions.length} regions`, icon: <Building2 size={13} /> },
    { label: 'Open Work', value: e.openTickets, hint: `${e.criticalTickets} critical`, icon: <ClipboardList size={13} />, trend: tr(data.trends.openWork) },
    { label: 'Supplier Breaches', value: e.supplierSlaBreaches, icon: <Truck size={13} />, tone: e.supplierSlaBreaches ? 'warn' : 'good', trend: tr(data.trends.supplierBreaches) },
    { label: 'Internal Breaches', value: e.internalSlaBreaches, icon: <ShieldAlert size={13} />, tone: e.internalSlaBreaches ? 'warn' : 'good' },
    { label: 'Commercial Exposure', value: fmtK(e.costExposure), icon: <Banknote size={13} />, trend: tr(data.trends.cost) },
    { label: 'Repeat Defects', value: data.repeatDefects.length, icon: <Repeat size={13} />, tone: data.repeatDefects.length ? 'warn' : 'good' },
    { label: 'Region Alerts', value: data.regions.filter(r => r.region.status !== 'controlled').length, icon: <Globe2 size={13} />, tone: 'warn' },
    { label: 'Decisions Required', value: data.decisions.filter(d => d.category !== 'Monitor').length, icon: <Gavel size={13} />, tone: 'gold' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Globe2 className="text-[#C6A35D]" size={22} /> Estate</h1>
        <p className="text-sm text-slate-400 mt-0.5">{fullName ? `${fullName.split(' ')[0]} · ` : ''}Total business maintenance position.</p>
      </div>

      {/* Hero */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <Donut value={e.finalEstateHealth} status={e.status} size={140} label="Estate" />
          <div className="flex-1 min-w-0 space-y-3 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-white">Estate Health</h2><Pill status={e.status} label={STATUS_LABELS[e.status]} />
            </div>
            <p className="text-sm text-slate-300">
              Weighted regional health {e.weightedRegionalHealth}% − risk penalty {e.riskPenalty}% = <strong className={STATUS_TEXT[e.status]}>{e.finalEstateHealth}%</strong>. Main driver: <strong>{e.mainRiskDriver}</strong>.
            </p>
            {e.appliedPenalties.length > 0 && (
              <div className="flex flex-wrap gap-1.5">{e.appliedPenalties.map((p, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-300">{p}</span>)}</div>
            )}
            <DistributionBar counts={e.counts} />
          </div>
        </div>
      </Card>

      <KpiRow kpis={kpis} />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <SectionCard title="Regional Ranking" action={<Link href="/executive/regions" className="text-xs text-[#C6A35D] hover:underline flex items-center gap-1">All <ArrowRight size={12} /></Link>}>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[600px]">
                <thead><tr className="text-left text-[11px] text-slate-500 border-b border-white/5"><th className="py-2 px-2">#</th><th className="px-2">Region</th><th className="px-2">Health</th><th className="px-2">Status</th><th className="px-2">Stores</th><th className="px-2">Open</th><th className="px-2">Exposure</th></tr></thead>
                <tbody>
                  {data.regions.slice(0, 6).map(({ rank, region, regionName }) => (
                    <tr key={region.regionId} className="border-b border-white/5">
                      <td className="py-2 px-2 text-slate-500">{rank}</td><td className="px-2 text-white">{regionName}</td>
                      <td className={`px-2 font-semibold ${STATUS_TEXT[region.status]}`}>{region.finalPortfolioHealth}%</td>
                      <td className="px-2"><Pill status={region.status} /></td><td className="px-2 text-slate-300">{region.activeStores}</td>
                      <td className="px-2 text-slate-300">{region.openTickets}</td><td className="px-2 text-slate-300">{fmtK(region.costExposure)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Top Risk Stores" icon={<ShieldAlert size={15} className="text-red-400" />} action={<Link href="/executive/stores" className="text-xs text-[#C6A35D] hover:underline flex items-center gap-1">All <ArrowRight size={12} /></Link>}>
            {data.topRiskStores.slice(0, 6).map((s, i) => (
              <div key={s.storeId} className="flex items-center justify-between gap-2 py-1.5 border-b border-white/5 last:border-0">
                <div className="min-w-0"><p className="text-sm text-white truncate">#{i + 1} {s.storeName}</p><p className="text-[11px] text-slate-500 truncate">{s.mainIssue}</p></div>
                <span className="flex items-center gap-2 shrink-0"><span className="text-sm font-semibold text-white">{s.finalHealthScore}%</span><Pill status={s.finalStatus} /></span>
              </div>
            ))}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Store Health Distribution"><DistributionChips counts={e.counts} /></SectionCard>
          <SectionCard title="Executive Decisions Required" icon={<Gavel size={15} className="text-[#C6A35D]" />} action={<Link href="/executive/decisions" className="text-xs text-[#C6A35D] hover:underline flex items-center gap-1">All <ArrowRight size={12} /></Link>}>
            {data.decisions.slice(0, 5).map((d, i) => (
              <div key={i} className="py-2 border-b border-white/5 last:border-0">
                <p className="text-sm text-white">{d.title}</p>
                <p className="text-[11px] text-slate-500">{d.category} · {d.owner} · {d.deadlineDays}d</p>
              </div>
            ))}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
