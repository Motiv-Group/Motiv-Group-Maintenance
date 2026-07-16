'use client'

import { useState } from 'react'
import { Globe2, Trophy, AlertTriangle, ClipboardList, Gauge, Banknote, TrendingUp, CheckCircle2, ShieldAlert, Lock, Coins } from 'lucide-react'
import type { EstateDashboardData, StoreCard, TrendDelta } from '@/lib/health/data'
import type { RegionalHealthResult } from '@/lib/health/regionalHealth'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  SectionCard, KpiRow, Pill, Donut, BreakdownList, DistributionChips, QuickRow,
  RecommendedAction, StatusLegend, TrendArrow, STATUS_TEXT, type Kpi, type Trend,
} from '@/components/exec/ui'
import { Drawer, DrawerHeader, PrimaryButton } from '@/components/exec/Drawer'
import { ProvisionButton } from '@/components/exec/ProvisionPanel'
import { PendingRegionalManagers } from '@/components/exec/PendingRegionalManagers'
import { TabHeader, DateChip, FilterMenu, STATUS_FILTER_OPTIONS } from '@/components/exec/TabControls'

const tr = (d: TrendDelta): Trend | undefined => d.dir === 'flat' ? undefined : { dir: d.dir, label: `${d.pct}% vs yesterday` }

const fmtK = (n: number) => n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n)

export function RegionsTab({ data }: { data: EstateDashboardData }) {
  const regions = data.regions
  const [selId, setSelId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('all')
  const selected = regions.find(r => r.region.regionId === selId) ?? null
  const shown = status === 'all' ? regions : regions.filter(r => r.region.status === status)

  const best = [...regions].sort((a, b) => b.region.finalPortfolioHealth - a.region.finalPortfolioHealth)[0]
  const lowestBreaches = [...regions].sort((a, b) => (a.region.supplierSlaBreaches + a.region.internalSlaBreaches) - (b.region.supplierSlaBreaches + b.region.internalSlaBreaches))[0]
  const lowestCost = [...regions].sort((a, b) => a.region.costExposure - b.region.costExposure)[0]
  const supTotal = regions.reduce((s, r) => s + r.region.supplierSlaBreaches, 0)
  const intTotal = regions.reduce((s, r) => s + r.region.internalSlaBreaches, 0)

  const kpis: Kpi[] = [
    { label: 'Total Regions', value: regions.length, hint: 'Active regions', icon: <Globe2 size={13} /> },
    { label: 'Best Performing Region', value: best ? best.regionName : '—', hint: best ? `Health ${best.region.finalPortfolioHealth}%` : '', icon: <Trophy size={13} />, tone: 'gold' },
    { label: 'Regions Requiring Attention', value: regions.filter(r => r.region.finalPortfolioHealth < 80).length, hint: 'Below target (<80%)', icon: <AlertTriangle size={13} />, tone: 'warn' },
    { label: 'Open Work', value: regions.reduce((s, r) => s + r.region.openTickets, 0), hint: 'Across all regions', icon: <ClipboardList size={13} />, trend: tr(data.trends.openWork) },
    { label: 'SLA Pressure', value: supTotal + intTotal, hint: `Supplier ${supTotal} / Internal ${intTotal}`, icon: <Gauge size={13} />, tone: 'warn', trend: tr(data.trends.slaPressure) },
    { label: 'Cost Exposure', value: fmtK(regions.reduce((s, r) => s + r.region.costExposure, 0)), hint: 'Pending quote value', icon: <Banknote size={13} />, trend: tr(data.trends.cost) },
  ]

  const openRow = (id: string) => { setSelId(id); setOpen(true) }

  return (
    <div className="space-y-5">
      <TabHeader icon={<Globe2 size={18} className="text-[#f59e0b]" />} title="Regions" subtitle="Regional performance, portfolio health and executive attention areas.">
        <DateChip date={formatDate(data.generatedAt)} />
        <FilterMenu value={status} onChange={setStatus} options={STATUS_FILTER_OPTIONS} />
        <ProvisionButton mode="exec-regions" regions={regions.map(r => ({ id: r.region.regionId, name: r.regionName }))} label="Manage regions & RMs" />
      </TabHeader>

      <KpiRow kpis={kpis} />

      <PendingRegionalManagers />

      <div className="space-y-5">
        <div className="space-y-5 min-w-0">
          <SectionCard title="Regional Ranking — highest risk first">
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]">
                    <th className="py-2 px-2">#</th><th className="px-2">Region</th><th className="px-2">Health</th><th className="px-2">Trend</th><th className="px-2">Status</th>
                    <th className="px-2">Stores</th><th className="px-2">Red/Crit</th><th className="px-2">Open</th>
                    <th className="px-2">Sup SLA</th><th className="px-2">Int SLA</th><th className="px-2">Exposure</th><th className="px-2">Main Driver</th><th className="px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ rank, region, regionName, trend }) => (
                    <tr key={region.regionId} onClick={() => openRow(region.regionId)}
                      className={`border-b border-[var(--border)] cursor-pointer hover:bg-[var(--hover)] ${selId === region.regionId ? 'bg-[var(--hover)]' : ''}`}>
                      <td className="py-2.5 px-2 text-[var(--text-faint)]">{rank}</td>
                      <td className="px-2 font-medium text-[var(--text)] whitespace-nowrap">{regionName}</td>
                      <td className={`px-2 font-semibold ${STATUS_TEXT[region.status]}`}>{region.finalPortfolioHealth}%</td>
                      <td className="px-2"><TrendArrow t={{ dir: trend.dir, label: `${trend.pct}%`, good: trend.dir === 'up' }} /></td>
                      <td className="px-2"><Pill status={region.status} /></td>
                      <td className="px-2 text-[var(--text-muted)]">{region.activeStores}</td>
                      <td className="px-2 text-[var(--text-muted)]">{region.counts.at_risk} / {region.counts.critical}</td>
                      <td className="px-2 text-[var(--text-muted)]">{region.openTickets}</td>
                      <td className="px-2 text-[var(--text-muted)]">{region.supplierSlaBreaches}</td>
                      <td className="px-2 text-[var(--text-muted)]">{region.internalSlaBreaches}</td>
                      <td className="px-2 text-[var(--text-muted)] whitespace-nowrap">{fmtK(region.costExposure)}</td>
                      <td className="px-2 text-xs text-[var(--text-muted)] max-w-[200px] truncate">{region.mainReason}</td>
                      <td className="px-2">
                        <span className={`text-[11px] px-2 py-1 rounded-lg ring-1 ${region.status === 'controlled' ? 'text-[var(--text-muted)] ring-black/10 dark:ring-white/10' : 'text-[#f59e0b] ring-[#f59e0b]/40'}`}>
                          {region.status === 'controlled' ? 'Monitor' : 'Review'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {shown.length === 0 && <tr><td colSpan={13} className="py-6 text-center text-[var(--text-faint)]">No regions match this filter.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-3"><StatusLegend /></div>
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SectionCard title="Regions Requiring Attention" icon={<AlertTriangle size={15} className="text-[#f59e0b]" />}>
              {regions.filter(r => r.region.status !== 'controlled').slice(0, 5).map(({ region, regionName }) => (
                <div key={region.regionId} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0">
                  <div className="min-w-0"><Pill status={region.status} label={regionName} /><p className="text-xs text-[var(--text-muted)] mt-1 truncate">{region.mainReason}</p></div>
                  <span className={`text-sm font-semibold ${STATUS_TEXT[region.status]}`}>{region.finalPortfolioHealth}%</span>
                </div>
              ))}
              {regions.every(r => r.region.status === 'controlled') && <p className="text-sm text-[var(--text-faint)]">All regions controlled.</p>}
            </SectionCard>

            <SectionCard title="Performing Well" icon={<CheckCircle2 size={15} className="text-emerald-400" />}>
              <PerfRow icon={<Trophy size={15} className="text-[#f59e0b]" />} label="Best Performing Region" value={best ? `${best.regionName} (${best.region.finalPortfolioHealth}%)` : '—'} />
              <PerfRow icon={<Lock size={15} className="text-emerald-400" />} label="Lowest SLA Breaches" value={lowestBreaches ? `${lowestBreaches.regionName}` : '—'} />
              <PerfRow icon={<Coins size={15} className="text-emerald-400" />} label="Lowest Cost Exposure" value={lowestCost ? `${lowestCost.regionName} (${fmtK(lowestCost.region.costExposure)})` : '—'} />
            </SectionCard>
          </div>
        </div>
      </div>

      {/* Click-to-open slide-over detail */}
      <Drawer open={open} onClose={() => setOpen(false)}>
        {selected && <RegionDetail data={data} region={selected.region} name={selected.regionName} onClose={() => setOpen(false)} />}
      </Drawer>
    </div>
  )
}

function PerfRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0">
      <span className="w-8 h-8 rounded-lg bg-black/[0.04] dark:bg-white/5 flex items-center justify-center shrink-0">{icon}</span>
      <div className="min-w-0"><div className="text-[11px] text-[var(--text-faint)]">{label}</div><div className="text-sm text-[var(--text)] truncate">{value}</div></div>
    </div>
  )
}

function RegionDetail({ data, region, name, onClose }: { data: EstateDashboardData; region: RegionalHealthResult; name: string; onClose?: () => void }) {
  const stores = data.stores.filter(s => s.regionId === region.regionId)
  const avg = (sel: (s: StoreCard) => number) => stores.length ? stores.reduce((a, s) => a + sel(s), 0) / stores.length : 0
  const top5 = [...stores].sort((a, b) => a.finalHealthScore - b.finalHealthScore).slice(0, 5)
  const repeatAlerts = stores.filter(s => s.repeatGroups > 0).length
  const quotesAwaiting = stores.reduce((a, s) => a + s.pendingDecisions, 0)

  return (
    <div className="space-y-4">
      <DrawerHeader onClose={onClose}
        title={<div className="flex items-center gap-2 flex-wrap"><h3 className="text-lg font-bold text-[var(--text)]">{name}</h3><Pill status={region.status} /></div>} />
      <div>
        <div className={`text-3xl font-bold ${STATUS_TEXT[region.status]}`}>{region.finalPortfolioHealth}%</div>
        <p className="text-xs text-[var(--text-muted)] mt-1">{region.activeStores} Stores · {region.counts.at_risk} Red · {region.counts.critical} Critical</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">Main driver: {region.mainReason}</p>
      </div>

      <div>
        <div className="text-xs font-semibold text-[var(--text-muted)] mb-3">Health Breakdown</div>
        <div className="flex items-center gap-4">
          <Donut value={region.finalPortfolioHealth} status={region.status} size={104} />
          <div className="flex-1">
            <BreakdownList rows={[
              { label: 'Operational Risk', value: avg(s => s.breakdown.operationalRisk), max: 30 },
              { label: 'SLA Performance', value: avg(s => s.breakdown.sla), max: 20 },
              { label: 'Ticket Load', value: avg(s => s.breakdown.ticketLoad), max: 15 },
              { label: 'Repeat Defects', value: avg(s => s.breakdown.repeatDefect), max: 15 },
              { label: 'Commercial Impact', value: avg(s => s.breakdown.commercialBlocker), max: 10 },
              { label: 'Data Quality', value: avg(s => s.breakdown.dataQuality), max: 10 },
            ]} />
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-[var(--text-muted)] mb-2">Store Health Distribution</div>
        <DistributionChips counts={region.counts} />
      </div>

      {top5.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[var(--text-muted)] mb-1">Top {top5.length} Stores Needing Attention</div>
          {top5.map((s, i) => (
            <div key={s.storeId} className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-0 text-xs">
              <span className="text-[var(--text-muted)] truncate">{i + 1}. {s.storeName}</span>
              <span className={STATUS_TEXT[s.finalStatus]}>{s.finalHealthScore}%</span>
            </div>
          ))}
        </div>
      )}

      <div>
        <QuickRow label="Supplier SLA Breaches" value={region.supplierSlaBreaches} tone={region.supplierSlaBreaches ? 'bad' : 'default'} />
        <QuickRow label="Internal SLA Breaches" value={region.internalSlaBreaches} tone={region.internalSlaBreaches ? 'bad' : 'default'} />
        <QuickRow label="Quotes Awaiting Approval" value={quotesAwaiting} />
        <QuickRow label="Cost Exposure" value={fmtK(region.costExposure)} />
        <QuickRow label="Repeat Defect Alerts" value={repeatAlerts} tone={repeatAlerts ? 'bad' : 'default'} />
      </div>

      <RecommendedAction text={region.status === 'controlled' ? 'Region controlled — maintain current cadence.' : `Address ${region.appliedPenalties[0] ?? 'open work'} and follow up the top attention stores.`} />
      <PrimaryButton tone="danger">View Region Details</PrimaryButton>
    </div>
  )
}
