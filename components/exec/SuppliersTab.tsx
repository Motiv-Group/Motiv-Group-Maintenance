'use client'

import { useState } from 'react'
import { Truck, Gauge, AlertTriangle, ClipboardList, Clock, Banknote, ShieldAlert } from 'lucide-react'
import type { EstateDashboardData } from '@/lib/health/data'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  SectionCard, KpiRow, Pill, Donut, BreakdownList, QuickRow, RecommendedAction, TrendArrow, STATUS_TEXT, type Kpi,
} from '@/components/exec/ui'
import { Drawer, DrawerHeader, PrimaryButton } from '@/components/exec/Drawer'
import { ProvisionButton } from '@/components/exec/ProvisionPanel'
import { TabHeader, DateChip, FilterMenu, ExportButton, exportCsv, STATUS_FILTER_OPTIONS } from '@/components/exec/TabControls'

type Supplier = EstateDashboardData['suppliers'][number]
const fmtK = (n: number) => n ? (n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n)) : 'R 0'
const clamp = (n: number, lo = 0, hi = 20) => Math.max(lo, Math.min(hi, Math.round(n)))

function axes(s: Supplier) {
  const p = s.perf
  return {
    response: p.avgResponseMins == null ? 14 : clamp(20 - p.avgResponseMins / 60),
    completion: p.avgResolutionMins == null ? 14 : clamp(20 - (p.avgResolutionMins / 1440) * 1.5),
    firstFix: clamp(p.firstTimeFixRate * 20),
    evidence: clamp(p.evidenceCompletionRate * 20),
    communication: clamp(20 - p.escalationCount * 3),
  }
}

export function SuppliersTab({ data }: { data: EstateDashboardData }) {
  const suppliers = data.suppliers
  const [selId, setSelId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('all')
  const selected = suppliers.find(s => s.id === selId) ?? null
  const openRow = (id: string) => { setSelId(id); setOpen(true) }
  const shown = status === 'all' ? suppliers : suppliers.filter(s => s.perf.band === status)

  const onExport = () => exportCsv('supplier-performance.csv',
    ['Supplier', 'SLA%', 'Status', 'Open', 'Overdue', 'Avg Response (hrs)', 'Avg Completion (days)', 'First Time Fix %', 'Repeat %', 'Cost Exposure', 'Escalations'],
    shown.map(s => [s.name, s.perf.performanceScore, s.perf.band,
      s.open, s.overdue,
      s.perf.avgResponseMins == null ? '' : (s.perf.avgResponseMins / 60).toFixed(1),
      s.perf.avgResolutionMins == null ? '' : (s.perf.avgResolutionMins / 1440).toFixed(1),
      Math.round(s.perf.firstTimeFixRate * 100),
      s.perf.assignedTickets ? Math.round(s.perf.repeatDefectInvolvement / s.perf.assignedTickets * 100) : 0,
      s.costExposure, s.perf.escalationCount]))

  const overall = suppliers.length ? Math.round(suppliers.reduce((a, s) => a + s.perf.performanceScore, 0) / suppliers.length) : 100
  const buckets = { hi: 0, mid: 0, lo: 0, risk: 0 }
  for (const s of suppliers) { const v = s.perf.performanceScore; if (v >= 90) buckets.hi++; else if (v >= 80) buckets.mid++; else if (v >= 70) buckets.lo++; else buckets.risk++ }
  const topCost = [...suppliers].sort((a, b) => b.costExposure - a.costExposure).slice(0, 5)
  const maxCost = topCost[0]?.costExposure || 1
  const escalated = suppliers.filter(s => s.perf.escalationCount > 0 || s.perf.band === 'at_risk' || s.perf.band === 'critical')

  const kpis: Kpi[] = [
    { label: 'Total Suppliers', value: suppliers.length, hint: 'Active suppliers', icon: <Truck size={13} /> },
    { label: 'Supplier SLA (Overall)', value: `${overall}%`, icon: <Gauge size={13} />, tone: overall >= 80 ? 'good' : 'warn' },
    { label: 'Suppliers At Risk', value: suppliers.filter(s => s.perf.band === 'at_risk' || s.perf.band === 'critical').length, hint: 'Below 70% SLA', icon: <AlertTriangle size={13} />, tone: 'warn' },
    { label: 'Open Work', value: suppliers.reduce((a, s) => a + s.open, 0), icon: <ClipboardList size={13} /> },
    { label: 'Overdue Work', value: suppliers.reduce((a, s) => a + s.overdue, 0), icon: <Clock size={13} />, tone: 'warn' },
    { label: 'Cost Exposure', value: fmtK(suppliers.reduce((a, s) => a + s.costExposure, 0)), icon: <Banknote size={13} /> },
  ]

  return (
    <div className="space-y-5">
      <TabHeader icon={<Truck size={18} className="text-[#f59e0b]" />} title="Suppliers" subtitle="Supplier performance, SLA delivery, response quality and accountability.">
        <DateChip date={formatDate(data.generatedAt)} />
        <FilterMenu value={status} onChange={setStatus} options={STATUS_FILTER_OPTIONS} />
        <ExportButton onExport={onExport} />
        <ProvisionButton mode="suppliers" label="Add suppliers" />
      </TabHeader>

      <KpiRow kpis={kpis} />

      <div className="space-y-5">
        <div className="space-y-5 min-w-0">
          <SectionCard title="Supplier Performance Ranking — highest risk first">
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[900px]">
                <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]">
                  <th className="py-2 px-2">#</th><th className="px-2">Supplier</th><th className="px-2">SLA%</th><th className="px-2">Trend</th><th className="px-2">Status</th>
                  <th className="px-2">Open</th><th className="px-2">Overdue</th><th className="px-2">Resp (hrs)</th><th className="px-2">Compl (days)</th>
                  <th className="px-2">First-fix</th><th className="px-2">Repeat</th><th className="px-2">Exposure</th><th className="px-2">Escal.</th><th className="px-2"></th>
                </tr></thead>
                <tbody>
                  {shown.map((s, i) => (
                    <tr key={s.id} onClick={() => openRow(s.id)} className={`border-b border-[var(--border)] cursor-pointer hover:bg-[var(--hover)] ${selId === s.id ? 'bg-[var(--hover)]' : ''}`}>
                      <td className="py-2.5 px-2 text-[var(--text-faint)]">{i + 1}</td><td className="px-2 text-[var(--text)]">{s.name}</td>
                      <td className={`px-2 font-semibold ${STATUS_TEXT[s.perf.band]}`}>{s.perf.performanceScore}%</td>
                      <td className="px-2"><TrendArrow t={{ dir: s.trend.dir, label: `${s.trend.pct}%`, good: s.trend.dir === 'up' }} /></td>
                      <td className="px-2"><Pill status={s.perf.band} /></td>
                      <td className="px-2 text-[var(--text-muted)]">{s.open}</td><td className="px-2 text-red-400">{s.overdue}</td>
                      <td className="px-2 text-[var(--text-muted)]">{s.perf.avgResponseMins == null ? '—' : (s.perf.avgResponseMins / 60).toFixed(1)}</td>
                      <td className="px-2 text-[var(--text-muted)]">{s.perf.avgResolutionMins == null ? '—' : (s.perf.avgResolutionMins / 1440).toFixed(1)}</td>
                      <td className="px-2 text-[var(--text-muted)]">{Math.round(s.perf.firstTimeFixRate * 100)}%</td>
                      <td className="px-2 text-[var(--text-muted)]">{s.perf.assignedTickets ? Math.round(s.perf.repeatDefectInvolvement / s.perf.assignedTickets * 100) : 0}%</td>
                      <td className="px-2 text-[var(--text-muted)] whitespace-nowrap">{fmtK(s.costExposure)}</td><td className="px-2 text-[var(--text-muted)]">{s.perf.escalationCount}</td>
                      <td className="px-2"><span className={`text-[11px] px-2 py-1 rounded-lg ring-1 ${s.perf.band === 'controlled' ? 'text-[var(--text-muted)] ring-white/10' : 'text-[#f59e0b] ring-[#f59e0b]/40'}`}>{s.perf.band === 'controlled' ? 'Monitor' : 'Review'}</span></td>
                    </tr>
                  ))}
                  {!shown.length && <tr><td colSpan={14} className="py-6 text-center text-[var(--text-faint)]">No suppliers match this filter.</td></tr>}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <SectionCard title="Supplier SLA Distribution">
              <div className="space-y-2 text-sm">
                <Bucket color="bg-emerald-500" label="≥ 90%" n={buckets.hi} total={suppliers.length} />
                <Bucket color="bg-emerald-400" label="80 – 89%" n={buckets.mid} total={suppliers.length} />
                <Bucket color="bg-[#f59e0b]" label="70 – 79%" n={buckets.lo} total={suppliers.length} />
                <Bucket color="bg-red-500" label="< 70%" n={buckets.risk} total={suppliers.length} />
              </div>
            </SectionCard>
            <SectionCard title="SLA Trend (Overall)">
              <Sparkline series={data.supplierSlaSeries} />
            </SectionCard>
            <SectionCard title="Top Suppliers by Cost Exposure">
              {topCost.map((s, i) => (
                <div key={s.id} className="py-1.5">
                  <div className="flex justify-between text-xs mb-1"><span className="text-[var(--text-muted)]">{i + 1}. {s.name}</span><span className="text-[var(--text-muted)]">{fmtK(s.costExposure)}</span></div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#f59e0b]" style={{ width: `${(s.costExposure / maxCost) * 100}%` }} /></div>
                </div>
              ))}
              {!topCost.length && <p className="text-sm text-[var(--text-faint)]">No exposure.</p>}
            </SectionCard>
          </div>

          <SectionCard title="Recent Supplier Escalations" icon={<ShieldAlert size={15} className="text-red-400" />}>
            {data.escalations.length > 0 ? (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm min-w-[640px]">
                  <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]">
                    <th className="py-2 px-2">Supplier</th><th className="px-2">Issue</th><th className="px-2">Escalated On</th><th className="px-2">By</th><th className="px-2">Status</th><th className="px-2">Action Required</th>
                  </tr></thead>
                  <tbody>
                    {data.escalations.slice(0, 6).map(e => (
                      <tr key={e.id} className="border-b border-[var(--border)]">
                        <td className="py-2 px-2 text-[var(--text)] whitespace-nowrap">{e.supplierName}</td>
                        <td className="px-2 text-[var(--text-muted)] max-w-[200px] truncate">{e.issue}</td>
                        <td className="px-2 text-[var(--text-muted)] whitespace-nowrap">{formatDate(e.escalatedAt)}</td>
                        <td className="px-2 text-[var(--text-muted)] whitespace-nowrap">{e.escalatedBy ?? '—'}</td>
                        <td className="px-2"><span className={`text-[11px] px-2 py-0.5 rounded-full ${e.status === 'resolved' ? 'bg-emerald-500/15 text-emerald-400' : e.status === 'in_progress' ? 'bg-blue-500/15 text-blue-500' : 'bg-red-500/15 text-red-400'}`}>{e.status.replace('_', ' ')}</span></td>
                        <td className="px-2 text-[var(--text-muted)] max-w-[200px] truncate">{e.actionRequired ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : escalated.length > 0 ? (
              escalated.slice(0, 5).map(s => (
                <div key={s.id} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0">
                  <div className="min-w-0"><p className="text-sm text-[var(--text)] truncate">{s.name}</p><p className="text-[11px] text-[var(--text-faint)]">{s.perf.slaBreaches} SLA breaches · {s.overdue} overdue</p></div>
                  <Pill status={s.perf.band} />
                </div>
              ))
            ) : <p className="text-sm text-[var(--text-faint)]">No escalations logged.</p>}
          </SectionCard>
        </div>
      </div>

      <Drawer open={open} onClose={() => setOpen(false)}>{selected && <SupplierDetail s={selected} onClose={() => setOpen(false)} />}</Drawer>
    </div>
  )
}

/** Minimal SVG line sparkline for the SLA-trend series (flat message until snapshots exist). */
function Sparkline({ series }: { series: { label: string; value: number }[] }) {
  if (series.length < 2) return <p className="text-sm text-[var(--text-faint)] py-6 text-center">Trend builds once daily snapshots run.</p>
  const w = 240, h = 90, pad = 8
  const xs = series.map((_, i) => pad + (i * (w - pad * 2)) / (series.length - 1))
  const ys = series.map(p => h - pad - (Math.max(0, Math.min(100, p.value)) / 100) * (h - pad * 2))
  const path = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  const last = series[series.length - 1].value
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24">
        <path d={path} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {xs.map((x, i) => <circle key={i} cx={x} cy={ys[i]} r="2.5" fill="#10b981" />)}
      </svg>
      <div className="flex justify-between text-[10px] text-[var(--text-faint)] mt-1">
        <span>{series[0].label}</span><span className="text-emerald-400 font-semibold">{last}%</span><span>{series[series.length - 1].label}</span>
      </div>
    </div>
  )
}

function Bucket({ color, label, n, total }: { color: string; label: string; n: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`} /><span className="text-[var(--text-muted)] w-20">{label}</span>
      <span className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden"><span className={`block h-full ${color}`} style={{ width: `${total ? (n / total) * 100 : 0}%` }} /></span>
      <span className="text-[var(--text)] w-8 text-right">{n}</span>
    </div>
  )
}

function SupplierDetail({ s, onClose }: { s: Supplier; onClose?: () => void }) {
  const a = axes(s)
  return (
    <div className="space-y-4">
      <DrawerHeader onClose={onClose} title={<div className="flex items-center gap-2 flex-wrap"><h3 className="text-lg font-bold text-[var(--text)]">{s.name}</h3><Pill status={s.perf.band} /></div>} />
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-white/5 px-2 py-2"><div className="text-[10px] text-[var(--text-faint)]">Open</div><div className="text-sm font-semibold text-[var(--text)]">{s.open}</div></div>
        <div className="rounded-lg bg-white/5 px-2 py-2"><div className="text-[10px] text-[var(--text-faint)]">Overdue</div><div className="text-sm font-semibold text-red-400">{s.overdue}</div></div>
        <div className="rounded-lg bg-white/5 px-2 py-2"><div className="text-[10px] text-[var(--text-faint)]">Cost</div><div className="text-sm font-semibold text-[var(--text)]">{fmtK(s.costExposure)}</div></div>
      </div>
      <div>
        <div className="text-xs font-semibold text-[var(--text-muted)] mb-3">SLA Breakdown</div>
        <div className="flex items-center gap-4">
          <Donut value={s.perf.performanceScore} status={s.perf.band} size={104} label="SLA" />
          <div className="flex-1"><BreakdownList rows={[
            { label: 'Response Time', value: a.response, max: 20 },
            { label: 'Completion Time', value: a.completion, max: 20 },
            { label: 'First Time Fix', value: a.firstFix, max: 20 },
            { label: 'Evidence Quality', value: a.evidence, max: 20 },
            { label: 'Communication', value: a.communication, max: 20 },
          ]} /></div>
        </div>
      </div>
      <div>
        <QuickRow label="Escalations" value={s.perf.escalationCount} tone={s.perf.escalationCount ? 'bad' : 'default'} />
        <QuickRow label="SLA Breaches" value={s.perf.slaBreaches} tone={s.perf.slaBreaches ? 'bad' : 'default'} />
        <QuickRow label="Overdue Work" value={s.overdue} tone={s.overdue ? 'bad' : 'default'} />
        <QuickRow label="Repeat Defects" value={s.perf.repeatDefectInvolvement} />
        <QuickRow label="Cost Exposure" value={fmtK(s.costExposure)} />
      </div>
      <RecommendedAction text={s.perf.band === 'controlled' ? 'Performing well — maintain.' : 'SLA below target. Review performance, escalate delays and implement a recovery plan.'} />
      <PrimaryButton tone="danger">View Supplier Details</PrimaryButton>
    </div>
  )
}
