'use client'

import { useState } from 'react'
import { Store, Building2, ShieldAlert, AlertTriangle, AlertOctagon, ClipboardList, ReceiptText, Banknote, Truck, Lock, Repeat, Gavel, CheckCircle2, Trophy, TrendingUp } from 'lucide-react'
import type { EstateDashboardData, StoreCard } from '@/lib/health/data'
import { statusForScore, STATUS_LABELS } from '@/lib/health/constants'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Card, SectionCard, KpiRow, Pill, Donut, BreakdownList, DistributionBar, RecommendedAction, TrendArrow, STATUS_TEXT, type Kpi,
} from '@/components/exec/ui'
import { Drawer, DrawerHeader, PrimaryButton } from '@/components/exec/Drawer'
import { TabHeader, DateChip, FilterMenu, ExportButton, exportCsv, STATUS_FILTER_OPTIONS } from '@/components/exec/TabControls'

const FLAT = { dir: 'flat' as const, pct: 0 }

const fmtK = (n: number) => n ? (n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n)) : 'R 0,00'

export function StoresTab({ data, initialStatus = 'all' }: { data: EstateDashboardData; initialStatus?: string }) {
  const stores = data.stores
  const [selId, setSelId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(initialStatus)
  const selected = stores.find(s => s.storeId === selId) ?? null
  const openRow = (id: string) => { setSelId(id); setOpen(true) }
  const trendOf = (id: string) => data.storeTrends[id] ?? FLAT

  const counts = { controlled: 0, attention: 0, at_risk: 0, critical: 0 }
  for (const s of stores) counts[s.finalStatus]++
  const avg = stores.length ? Math.round(stores.reduce((a, s) => a + s.finalHealthScore, 0) / stores.length) : 100
  const avgStatus = statusForScore(avg)
  const regionCount = new Set(stores.map(s => s.regionId)).size
  const sum = (sel: (s: StoreCard) => number) => stores.reduce((a, s) => a + sel(s), 0)

  const supplierBreaches = sum(s => s.supplierBreaches)
  const internalBreaches = sum(s => s.internalBreaches)
  const kpis: Kpi[] = [
    { label: 'Active Stores', value: stores.length, hint: `${regionCount} regions`, icon: <Building2 size={13} />, href: '/executive/stores' },
    { label: 'At Risk', value: counts.at_risk, hint: `${pct(counts.at_risk, stores.length)}% of stores`, icon: <ShieldAlert size={13} />, tone: counts.at_risk ? 'bad' : 'good', href: '/executive/stores?status=at_risk' },
    { label: 'Critical', value: counts.critical, hint: `${pct(counts.critical, stores.length)}% of stores`, icon: <AlertOctagon size={13} />, tone: counts.critical ? 'bad' : 'good', href: '/executive/stores?status=critical' },
    { label: 'Attention Required', value: counts.attention, icon: <AlertTriangle size={13} />, tone: counts.attention ? 'warn' : 'good', href: '/executive/stores?status=attention' },
    { label: 'Open Work', value: sum(s => s.openTickets), hint: `${counts.critical} critical`, icon: <ClipboardList size={13} />, href: '/executive/insights/open-work' },
    { label: 'Pending Approvals', value: sum(s => s.pendingDecisions), icon: <ReceiptText size={13} />, href: '/executive/decisions' },
    { label: 'Internal Breaches', value: internalBreaches, icon: <Lock size={13} />, tone: internalBreaches ? 'warn' : 'good', href: '/executive/insights/internal-breaches' },
    { label: 'Supplier Breaches', value: supplierBreaches, icon: <Truck size={13} />, tone: supplierBreaches ? 'warn' : 'good', href: '/executive/suppliers' },
    { label: 'Repeat Defects', value: stores.filter(s => s.repeatGroups > 0).length, icon: <Repeat size={13} />, href: '/executive/insights/repeat-defects' },
    { label: 'Decisions', value: data.decisions.filter(d => d.category !== 'Monitor').length, icon: <Gavel size={13} />, tone: 'gold', href: '/executive/decisions' },
    { label: 'Cost Exposure', value: fmtK(sum(s => s.costExposure)), icon: <Banknote size={13} />, href: '/executive/insights/cost-exposure' },
  ]

  const ranked = [...stores].sort((a, b) => a.finalHealthScore - b.finalHealthScore)
  const shown = status === 'all' ? ranked : ranked.filter(s => s.finalStatus === status)
  const attention = ranked.filter(s => s.finalStatus !== 'controlled')
  const best = [...stores].sort((a, b) => b.finalHealthScore - a.finalHealthScore)[0]
  const lowestOpen = [...stores].sort((a, b) => a.openTickets - b.openTickets)[0]
  const mostImproved = [...stores]
    .map(s => ({ s, up: trendOf(s.storeId).dir === 'up' ? trendOf(s.storeId).pct : 0 }))
    .sort((a, b) => b.up - a.up)[0]

  const onExport = () => exportCsv('store-ranking.csv',
    ['Store', 'Region', 'Health', 'Trend', 'Status', 'Open', 'Overdue', 'Approvals', 'Exposure', 'Main Driver'],
    shown.map(s => {
      const t = trendOf(s.storeId)
      return [s.storeName, s.regionName, s.finalHealthScore, t.dir === 'flat' ? '—' : `${t.dir === 'up' ? '+' : '-'}${t.pct}%`, s.finalStatus, s.openTickets, s.overdueTickets, s.pendingDecisions, s.costExposure, s.mainIssue]
    }))

  return (
    <div className="space-y-5">
      <TabHeader icon={<Store size={18} className="text-[#f59e0b]" />} title="Store Performance" subtitle="Individual store health, exceptions and executive attention areas.">
        <DateChip date={formatDate(data.generatedAt)} />
        <FilterMenu value={status} onChange={setStatus} options={STATUS_FILTER_OPTIONS} />
        <ExportButton onExport={onExport} />
      </TabHeader>

      {/* Hero */}
      <Card className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-center">
          <div className="flex items-center gap-4">
            <Donut value={avg} status={avgStatus} size={120} />
            <div><Pill status={avgStatus} label={STATUS_LABELS[avgStatus]} /><p className="text-sm text-[var(--text-muted)] mt-2 max-w-xs">Average store health {avg}%. {counts.attention} store(s) need follow-up; {counts.controlled} controlled.</p></div>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-[var(--text-muted)]">Health Distribution</div>
            <DistributionBar counts={counts} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)] pt-1">
              <span className="text-emerald-400">Controlled {counts.controlled} ({pct(counts.controlled, stores.length)}%)</span>
              <span className="text-[#f59e0b]">Attention {counts.attention} ({pct(counts.attention, stores.length)}%)</span>
              <span className="text-red-400">At Risk {counts.at_risk} ({pct(counts.at_risk, stores.length)}%)</span>
              <span className="text-red-300">Critical {counts.critical} ({pct(counts.critical, stores.length)}%)</span>
            </div>
          </div>
        </div>
      </Card>

      <KpiRow kpis={kpis} />

      <div className="space-y-5">
        <div className="space-y-5 min-w-0">
          <SectionCard title="Store Ranking">
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[820px]">
                <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]">
                  <th className="py-2 px-2">#</th><th className="px-2">Store</th><th className="px-2">Region</th><th className="px-2">Health</th><th className="px-2">Trend</th><th className="px-2">Status</th>
                  <th className="px-2">Open</th><th className="px-2">Overdue</th><th className="px-2">Approvals</th><th className="px-2">Exposure</th><th className="px-2">Main Driver</th><th className="px-2"></th>
                </tr></thead>
                <tbody>
                  {shown.map((s, i) => (
                    <tr key={s.storeId} onClick={() => openRow(s.storeId)} className={`border-b border-[var(--border)] cursor-pointer hover:bg-[var(--hover)] ${selId === s.storeId ? 'bg-[var(--hover)]' : ''}`}>
                      <td className="py-2.5 px-2 text-[var(--text-faint)]">{i + 1}</td><td className="px-2 text-[var(--text)]">{s.storeName}</td>
                      <td className="px-2 text-[var(--text-muted)]">{s.regionName}</td>
                      <td className={`px-2 font-semibold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</td>
                      <td className="px-2">{(() => { const t = trendOf(s.storeId); return <TrendArrow t={{ dir: t.dir, label: `${t.pct}%`, good: t.dir === 'up' }} /> })()}</td>
                      <td className="px-2"><Pill status={s.finalStatus} /></td>
                      <td className="px-2 text-[var(--text-muted)]">{s.openTickets}</td><td className="px-2 text-red-400">{s.overdueTickets}</td>
                      <td className="px-2 text-[var(--text-muted)]">{s.pendingDecisions}</td><td className="px-2 text-[var(--text-muted)] whitespace-nowrap">{fmtK(s.costExposure)}</td>
                      <td className="px-2 text-xs text-[var(--text-muted)] max-w-[200px] truncate">{s.mainIssue}</td>
                      <td className="px-2"><span className={`text-[11px] px-2 py-1 rounded-lg ring-1 ${s.finalStatus === 'controlled' ? 'text-[var(--text-muted)] ring-black/10 dark:ring-white/10' : 'text-[#f59e0b] ring-[#f59e0b]/40'}`}>{s.finalStatus === 'controlled' ? 'Monitor' : 'Review'}</span></td>
                    </tr>
                  ))}
                  {!shown.length && <tr><td colSpan={12} className="py-6 text-center text-[var(--text-faint)]">No stores match this filter.</td></tr>}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SectionCard title="Stores Requiring Attention" icon={<AlertTriangle size={15} className="text-[#f59e0b]" />}>
              {attention.slice(0, 5).map(s => (
                <div key={s.storeId} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0">
                  <div className="min-w-0"><p className="text-sm text-[var(--text)] truncate">{s.storeName}</p><p className="text-[11px] text-[var(--text-faint)] truncate">{s.mainIssue}</p></div>
                  <span className={`text-sm font-semibold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</span>
                </div>
              ))}
              {!attention.length && <p className="text-sm text-[var(--text-faint)]">All stores controlled.</p>}
            </SectionCard>
            <SectionCard title="Performing Well" icon={<CheckCircle2 size={15} className="text-emerald-400" />}>
              <Perf icon={<Trophy size={15} className="text-[#f59e0b]" />} label="Best Performing Store" value={best ? `${best.storeName} (${best.finalHealthScore}%)` : '—'} />
              <Perf icon={<TrendingUp size={15} className="text-emerald-400" />} label="Most Improved" value={mostImproved && mostImproved.up > 0 ? `${mostImproved.s.storeName} (+${mostImproved.up}%)` : '—'} />
              <Perf icon={<ClipboardList size={15} className="text-emerald-400" />} label="Lowest Open Work" value={lowestOpen ? `${lowestOpen.storeName} (${lowestOpen.openTickets} open)` : '—'} />
            </SectionCard>
          </div>
        </div>
      </div>

      <Drawer open={open} onClose={() => setOpen(false)}>{selected && <StoreDetail s={selected} onClose={() => setOpen(false)} />}</Drawer>
    </div>
  )
}

function Perf({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0"><span className="w-8 h-8 rounded-lg bg-black/[0.04] dark:bg-white/5 flex items-center justify-center shrink-0">{icon}</span><div className="min-w-0"><div className="text-[11px] text-[var(--text-faint)]">{label}</div><div className="text-sm text-[var(--text)] truncate">{value}</div></div></div>
}

function Snap({ label, value, bad }: { label: string; value: React.ReactNode; bad?: boolean }) {
  return <div className="rounded-lg bg-black/[0.04] dark:bg-white/5 px-3 py-2"><div className="text-[10px] text-[var(--text-faint)]">{label}</div><div className={`text-sm font-semibold ${bad ? 'text-red-400' : 'text-[var(--text)]'}`}>{value}</div></div>
}

function StoreDetail({ s, onClose }: { s: StoreCard; onClose?: () => void }) {
  return (
    <div className="space-y-4">
      <DrawerHeader onClose={onClose} title={<div className="flex items-center gap-2 flex-wrap"><h3 className="text-lg font-bold text-[var(--text)]">{s.storeName}</h3><Pill status={s.finalStatus} /></div>} />
      <div><div className={`text-3xl font-bold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</div><p className="text-xs text-[var(--text-muted)] mt-1">Region: {s.regionName} · Open work: {s.openTickets} · Pending approvals: {s.pendingDecisions}</p></div>
      <div>
        <div className="text-xs font-semibold text-[var(--text-muted)] mb-3">Health Breakdown</div>
        <div className="flex items-center gap-4">
          <Donut value={s.finalHealthScore} status={s.finalStatus} size={104} />
          <div className="flex-1"><BreakdownList rows={[
            { label: 'Operational Risk', value: s.breakdown.operationalRisk, max: 30 },
            { label: 'SLA Performance', value: s.breakdown.sla, max: 20 },
            { label: 'Ticket Load', value: s.breakdown.ticketLoad, max: 15 },
            { label: 'Repeat Defects', value: s.breakdown.repeatDefect, max: 15 },
            { label: 'Commercial Impact', value: s.breakdown.commercialBlocker, max: 10 },
            { label: 'Data Quality', value: s.breakdown.dataQuality, max: 10 },
          ]} /></div>
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-[var(--text-muted)] mb-2">Store Snapshot</div>
        <div className="grid grid-cols-3 gap-2">
          <Snap label="Open tickets" value={s.openTickets} />
          <Snap label="Overdue" value={s.overdueTickets} bad={s.overdueTickets > 0} />
          <Snap label="Pending approvals" value={s.pendingDecisions} />
          <Snap label="Cost exposure" value={fmtK(s.costExposure)} />
          <Snap label="Supplier SLA breaches" value={s.supplierBreaches} bad={s.supplierBreaches > 0} />
          <Snap label="Internal SLA breaches" value={s.internalBreaches} bad={s.internalBreaches > 0} />
        </div>
      </div>
      <div><div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Executive Attention</div><p className="text-xs text-[var(--text-muted)]">{s.mainIssue}.</p></div>
      <RecommendedAction text={s.finalStatus === 'controlled' ? 'No action needed — store controlled.' : 'Review and clear the flagged blocker to restore full store health.'} />
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]"><span>Owner: Approver / Executive</span><span>Priority: {s.finalStatus === 'controlled' ? 'Routine' : 'High'}</span></div>
      <PrimaryButton tone="gold">View Store Details</PrimaryButton>
    </div>
  )
}

function pct(n: number, total: number) { return total ? Math.round((n / total) * 100) : 0 }
