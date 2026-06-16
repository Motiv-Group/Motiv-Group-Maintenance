'use client'

import { useState } from 'react'
import { Truck, Gauge, AlertTriangle, ClipboardList, Clock, Banknote, ShieldAlert } from 'lucide-react'
import type { EstateDashboardData } from '@/lib/health/data'
import { formatCurrency } from '@/lib/utils'
import {
  Card, SectionCard, KpiRow, Pill, Donut, BreakdownList, QuickRow, RecommendedAction, STATUS_TEXT, type Kpi,
} from '@/components/exec/ui'
import { Drawer, DrawerHeader, PrimaryButton } from '@/components/exec/Drawer'
import { ProvisionPanel } from '@/components/exec/ProvisionPanel'

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
  const selected = suppliers.find(s => s.id === selId) ?? null
  const openRow = (id: string) => { setSelId(id); setOpen(true) }

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
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Truck className="text-[#C6A35D]" size={22} /> Suppliers</h1>
        <p className="text-sm text-slate-400 mt-0.5">Supplier performance, SLA delivery, response quality and accountability.</p>
      </div>

      <KpiRow kpis={kpis} />

      <ProvisionPanel mode="suppliers" />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <SectionCard title="Supplier Performance Ranking — highest risk first">
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[900px]">
                <thead><tr className="text-left text-[11px] text-slate-500 border-b border-white/5">
                  <th className="py-2 px-2">#</th><th className="px-2">Supplier</th><th className="px-2">SLA%</th><th className="px-2">Status</th>
                  <th className="px-2">Open</th><th className="px-2">Overdue</th><th className="px-2">Resp (hrs)</th><th className="px-2">Compl (days)</th>
                  <th className="px-2">First-fix</th><th className="px-2">Repeat</th><th className="px-2">Exposure</th><th className="px-2">Escal.</th><th className="px-2"></th>
                </tr></thead>
                <tbody>
                  {suppliers.map((s, i) => (
                    <tr key={s.id} onClick={() => openRow(s.id)} className={`border-b border-white/5 cursor-pointer hover:bg-white/[0.03] ${selId === s.id ? 'bg-white/[0.04]' : ''}`}>
                      <td className="py-2.5 px-2 text-slate-500">{i + 1}</td><td className="px-2 text-white">{s.name}</td>
                      <td className={`px-2 font-semibold ${STATUS_TEXT[s.perf.band]}`}>{s.perf.performanceScore}%</td><td className="px-2"><Pill status={s.perf.band} /></td>
                      <td className="px-2 text-slate-300">{s.open}</td><td className="px-2 text-red-400">{s.overdue}</td>
                      <td className="px-2 text-slate-300">{s.perf.avgResponseMins == null ? '—' : (s.perf.avgResponseMins / 60).toFixed(1)}</td>
                      <td className="px-2 text-slate-300">{s.perf.avgResolutionMins == null ? '—' : (s.perf.avgResolutionMins / 1440).toFixed(1)}</td>
                      <td className="px-2 text-slate-300">{Math.round(s.perf.firstTimeFixRate * 100)}%</td>
                      <td className="px-2 text-slate-300">{s.perf.assignedTickets ? Math.round(s.perf.repeatDefectInvolvement / s.perf.assignedTickets * 100) : 0}%</td>
                      <td className="px-2 text-slate-300 whitespace-nowrap">{fmtK(s.costExposure)}</td><td className="px-2 text-slate-300">{s.perf.escalationCount}</td>
                      <td className="px-2"><span className={`text-[11px] px-2 py-1 rounded-lg ring-1 ${s.perf.band === 'controlled' ? 'text-slate-300 ring-white/10' : 'text-[#C6A35D] ring-[#C6A35D]/40'}`}>{s.perf.band === 'controlled' ? 'Monitor' : 'Review'}</span></td>
                    </tr>
                  ))}
                  {!suppliers.length && <tr><td colSpan={13} className="py-6 text-center text-slate-500">No tickets linked to suppliers yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SectionCard title="Supplier SLA Distribution">
              <div className="space-y-2 text-sm">
                <Bucket color="bg-emerald-500" label="≥ 90%" n={buckets.hi} total={suppliers.length} />
                <Bucket color="bg-emerald-400" label="80 – 89%" n={buckets.mid} total={suppliers.length} />
                <Bucket color="bg-[#C6A35D]" label="70 – 79%" n={buckets.lo} total={suppliers.length} />
                <Bucket color="bg-red-500" label="< 70%" n={buckets.risk} total={suppliers.length} />
              </div>
            </SectionCard>
            <SectionCard title="Top Suppliers by Cost Exposure">
              {topCost.map((s, i) => (
                <div key={s.id} className="py-1.5">
                  <div className="flex justify-between text-xs mb-1"><span className="text-slate-300">{i + 1}. {s.name}</span><span className="text-slate-400">{fmtK(s.costExposure)}</span></div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#C6A35D]" style={{ width: `${(s.costExposure / maxCost) * 100}%` }} /></div>
                </div>
              ))}
              {!topCost.length && <p className="text-sm text-slate-500">No exposure.</p>}
            </SectionCard>
          </div>

          <SectionCard title="Recent Supplier Escalations" icon={<ShieldAlert size={15} className="text-red-400" />}>
            {escalated.slice(0, 5).map(s => (
              <div key={s.id} className="flex items-center justify-between gap-2 py-2 border-b border-white/5 last:border-0">
                <div className="min-w-0"><p className="text-sm text-white truncate">{s.name}</p><p className="text-[11px] text-slate-500">{s.perf.slaBreaches} SLA breaches · {s.overdue} overdue</p></div>
                <Pill status={s.perf.band} />
              </div>
            ))}
            {!escalated.length && <p className="text-sm text-slate-500">No escalations.</p>}
          </SectionCard>
        </div>

        <div className="hidden xl:block sticky top-20"><Card className="p-5">{selected ? <SupplierDetail s={selected} /> : <p className="text-sm text-slate-500">Select a supplier.</p>}</Card></div>
      </div>

      <Drawer open={open} onClose={() => setOpen(false)}>{selected && <SupplierDetail s={selected} onClose={() => setOpen(false)} />}</Drawer>
    </div>
  )
}

function Bucket({ color, label, n, total }: { color: string; label: string; n: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`} /><span className="text-slate-300 w-20">{label}</span>
      <span className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden"><span className={`block h-full ${color}`} style={{ width: `${total ? (n / total) * 100 : 0}%` }} /></span>
      <span className="text-slate-200 w-8 text-right">{n}</span>
    </div>
  )
}

function SupplierDetail({ s, onClose }: { s: Supplier; onClose?: () => void }) {
  const a = axes(s)
  return (
    <div className="space-y-4">
      <DrawerHeader onClose={onClose} title={<div className="flex items-center gap-2 flex-wrap"><h3 className="text-lg font-bold text-white">{s.name}</h3><Pill status={s.perf.band} /></div>} />
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-white/5 px-2 py-2"><div className="text-[10px] text-slate-500">Open</div><div className="text-sm font-semibold text-white">{s.open}</div></div>
        <div className="rounded-lg bg-white/5 px-2 py-2"><div className="text-[10px] text-slate-500">Overdue</div><div className="text-sm font-semibold text-red-400">{s.overdue}</div></div>
        <div className="rounded-lg bg-white/5 px-2 py-2"><div className="text-[10px] text-slate-500">Cost</div><div className="text-sm font-semibold text-white">{fmtK(s.costExposure)}</div></div>
      </div>
      <div>
        <div className="text-xs font-semibold text-slate-300 mb-3">SLA Breakdown</div>
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
