'use client'

import { useState } from 'react'
import { Gavel, AlertTriangle, ShieldAlert, Banknote, Users, FileWarning, Lightbulb, Gem, Coins } from 'lucide-react'
import type { EstateDashboardData } from '@/lib/health/data'
import type { DecisionItem } from '@/lib/health/decisions'
import { formatDate } from '@/lib/utils'
import { SectionCard, KpiRow, BreakdownList, QuickRow, RecommendedAction, Donut, type Kpi } from '@/components/exec/ui'
import { Drawer, DrawerHeader, PrimaryButton } from '@/components/exec/Drawer'
import { TabHeader, DateChip, FilterMenu, ExportButton, exportCsv, type FilterOption } from '@/components/exec/TabControls'

const BAND_FILTER: FilterOption[] = [
  { value: 'all', label: 'All priorities' }, { value: 'High', label: 'High' }, { value: 'Medium', label: 'Medium' }, { value: 'Low', label: 'Low' },
]

const fmtM = (n: number) => n >= 1_000_000 ? `R ${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : `R ${n}`
const BAND_PILL: Record<DecisionItem['band'], string> = {
  High: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
  Medium: 'bg-[#C6A35D]/15 text-[#C6A35D] ring-1 ring-[#C6A35D]/30',
  Low: 'bg-white/5 text-slate-300 ring-1 ring-white/10',
}
const bandStatus = (b: DecisionItem['band']) => b === 'High' ? 'at_risk' : b === 'Medium' ? 'attention' : 'controlled'

export function DecisionsTab({ data }: { data: EstateDashboardData }) {
  const decisions = data.decisions
  const [sel, setSel] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [band, setBand] = useState('all')
  const shown = band === 'all' ? decisions : decisions.filter(d => d.band === band)
  const selected = sel != null ? decisions.find(d => d.title === sel) ?? null : null
  const openRow = (title: string) => { setSel(title); setOpen(true) }

  const real = decisions.filter(d => d.category !== 'Monitor' || d.title !== 'No executive decisions outstanding')
  const exposure = decisions.reduce((a, d) => a + (d.exposureValue ?? 0), 0)
  const overdue = decisions.filter(d => d.urgency === 'high' && d.deadlineDays <= 1).length
  const strategicRisks = decisions.filter(d => /safety|trading|risk/i.test(d.businessImpact) || d.category === 'Accept Risk').length
  const supplierEsc = decisions.filter(d => d.category === 'Escalate Supplier').length
  const policy = decisions.filter(d => d.category === 'Policy Exception').length
  const highValue = decisions.filter(d => (d.exposureValue ?? 0) >= 50_000).length
  const savings = Math.round(decisions.filter(d => d.category === 'Approve Investment' || d.category === 'Change Strategy').reduce((a, d) => a + (d.exposureValue ?? 0), 0) * 0.15)

  const kpis: Kpi[] = [
    { label: 'Executive Actions', value: real.length, hint: 'Need leadership input', icon: <Gavel size={13} /> },
    { label: 'Overdue Actions', value: overdue, hint: 'Past due', icon: <AlertTriangle size={13} />, tone: overdue ? 'bad' : 'good' },
    { label: 'Strategic Risks', value: strategicRisks, hint: 'Safety / trading / supplier', icon: <ShieldAlert size={13} />, tone: 'warn' },
    { label: 'Commercial Exposure', value: fmtM(exposure), hint: 'Awaiting decision', icon: <Banknote size={13} /> },
    { label: 'Supplier Escalations', value: supplierEsc, icon: <Users size={13} />, tone: supplierEsc ? 'warn' : 'good' },
    { label: 'Policy Exceptions', value: policy, icon: <FileWarning size={13} /> },
  ]

  const statusOf = (d: DecisionItem) => d.category === 'Monitor' ? 'Monitor' : (d.urgency === 'high' && d.deadlineDays <= 1) ? 'Overdue' : 'Pending'

  const onExport = () => exportCsv('decision-queue.csv',
    ['Priority', 'Type', 'Decision Item', 'Business Impact', 'Exposure', 'Owner', 'Due (days)', 'Status'],
    shown.map(d => [d.band, d.category, d.title, d.businessImpact, d.exposureValue ?? 0, d.owner, d.deadlineDays, statusOf(d)]))

  return (
    <div className="space-y-5">
      <TabHeader icon={<Gavel size={18} className="text-[#C6A35D]" />} title="Decisions" subtitle="Strategic actions, escalations and business decisions requiring executive input.">
        <DateChip date={formatDate(data.generatedAt)} />
        <FilterMenu value={band} onChange={setBand} options={BAND_FILTER} label="Priority" />
        <ExportButton onExport={onExport} />
      </TabHeader>

      <KpiRow kpis={kpis} />

      <div className="space-y-5">
        <div className="space-y-5 min-w-0">
          <SectionCard title="Decision Queue — highest priority first">
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[860px]">
                <thead><tr className="text-left text-[11px] text-slate-500 border-b border-white/5">
                  <th className="py-2 px-2">#</th><th className="px-2">Priority</th><th className="px-2">Type</th><th className="px-2">Decision Item</th>
                  <th className="px-2">Business Impact</th><th className="px-2">Exposure</th><th className="px-2">Owner</th><th className="px-2">Due</th><th className="px-2">Status</th><th className="px-2"></th>
                </tr></thead>
                <tbody>
                  {shown.map((d, i) => (
                    <tr key={d.title} onClick={() => openRow(d.title)} className={`border-b border-white/5 cursor-pointer hover:bg-white/[0.03] ${sel === d.title ? 'bg-white/[0.04]' : ''}`}>
                      <td className="py-2.5 px-2 text-slate-500">{i + 1}</td>
                      <td className="px-2"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${BAND_PILL[d.band]}`}>{d.band}</span></td>
                      <td className="px-2 text-slate-300 whitespace-nowrap">{d.category}</td>
                      <td className="px-2 text-white max-w-[220px] truncate">{d.title}</td>
                      <td className="px-2 text-slate-400 text-xs">{d.businessImpact}</td>
                      <td className="px-2 text-slate-300 whitespace-nowrap">{d.exposureValue ? fmtM(d.exposureValue) : 'R 0'}</td>
                      <td className="px-2 text-slate-400 text-xs whitespace-nowrap">{d.owner}</td>
                      <td className="px-2 text-slate-400 text-xs">{d.deadlineDays}d</td>
                      <td className="px-2"><span className={`text-[11px] ${statusOf(d) === 'Overdue' ? 'text-red-400' : statusOf(d) === 'Monitor' ? 'text-slate-400' : 'text-[#C6A35D]'}`}>{statusOf(d)}</span></td>
                      <td className="px-2"><span className="text-[11px] px-2 py-1 rounded-lg ring-1 text-[#C6A35D] ring-[#C6A35D]/40">Review</span></td>
                    </tr>
                  ))}
                  {!shown.length && <tr><td colSpan={10} className="py-6 text-center text-slate-500">No decisions match this filter.</td></tr>}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SectionCard title="Immediate Attention" icon={<AlertTriangle size={15} className="text-red-400" />}>
              {decisions.filter(d => d.urgency === 'high').slice(0, 4).map((d, i) => (
                <div key={i} className="py-2 border-b border-white/5 last:border-0">
                  <p className="text-sm text-white">{d.title}</p>
                  <p className="text-[11px] text-slate-500">{d.recommendedAction} · {d.owner} · {d.deadlineDays}d</p>
                </div>
              ))}
              {!decisions.some(d => d.urgency === 'high') && <p className="text-sm text-slate-500">Nothing urgent.</p>}
            </SectionCard>
            <SectionCard title="Strategic Opportunities" icon={<Lightbulb size={15} className="text-[#C6A35D]" />}>
              <Opp text="Preventive maintenance can reduce repeat defects." show={decisions.some(d => d.category === 'Change Strategy')} />
              <Opp text="Contract review may improve supplier SLA." show={decisions.some(d => d.category === 'Review Contract' || d.category === 'Escalate Supplier')} />
              <Opp text="Budget reallocation can stabilise critical repairs." show={decisions.some(d => d.category === 'Reallocate Budget')} />
              <Opp text="Asset renewal likely to reduce reactive callouts." show={decisions.some(d => d.category === 'Approve Investment')} />
              <div className="grid grid-cols-2 gap-3 pt-3 mt-1 border-t border-white/5 text-center">
                <div><div className="flex items-center justify-center gap-1 text-[#C6A35D]"><Gem size={14} /><span className="text-lg font-bold">{highValue}</span></div><div className="text-[11px] text-slate-500">High-Value Items</div></div>
                <div><div className="flex items-center justify-center gap-1 text-emerald-400"><Coins size={14} /><span className="text-lg font-bold">{fmtM(savings)}</span></div><div className="text-[11px] text-slate-500">Potential Savings</div></div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>

      <Drawer open={open} onClose={() => setOpen(false)}>{selected && <DecisionDetail d={selected} data={data} onClose={() => setOpen(false)} />}</Drawer>
    </div>
  )
}

function Opp({ text, show }: { text: string; show: boolean }) {
  if (!show) return null
  return <div className="flex items-start gap-2 py-1.5 text-xs text-slate-300"><Lightbulb size={13} className="text-[#C6A35D] mt-0.5 shrink-0" />{text}</div>
}

function DecisionDetail({ d, data, onClose }: { d: DecisionItem; data: EstateDashboardData; onClose?: () => void }) {
  const avg = Math.round((d.scores.businessImpact + d.scores.urgency + d.scores.costEfficiency + d.scores.supplierReliability + d.scores.operationalBenefit + d.scores.strategicFit) / 6)
  // affected store status counts (cross-ref by name)
  const counts = { critical: 0, attention: 0, controlled: 0 }
  for (const name of d.affectedStores) {
    const st = data.stores.find(s => s.storeName === name)
    if (st?.finalStatus === 'critical' || st?.finalStatus === 'at_risk') counts.critical++
    else if (st?.finalStatus === 'attention') counts.attention++
    else counts.controlled++
  }
  return (
    <div className="space-y-4">
      <DrawerHeader onClose={onClose} title={<div className="flex items-center gap-2 flex-wrap"><h3 className="text-lg font-bold text-white">{d.title}</h3><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">Action Required</span></div>} />
      {d.exposureValue ? <div className="text-3xl font-bold text-red-400">{fmtM(d.exposureValue)}</div> : null}
      <p className="text-xs text-slate-400">{d.context}. Main driver: {d.mainDriver}.</p>
      <div>
        <div className="text-xs font-semibold text-slate-300 mb-3">Decision Summary</div>
        <div className="flex items-center gap-4">
          <Donut value={avg} status={bandStatus(d.band)} size={104} label={d.band} />
          <div className="flex-1"><BreakdownList rows={[
            { label: 'Business Impact', value: d.scores.businessImpact, max: 100 },
            { label: 'Urgency', value: d.scores.urgency, max: 100 },
            { label: 'Cost Efficiency', value: d.scores.costEfficiency, max: 100 },
            { label: 'Supplier Reliability', value: d.scores.supplierReliability, max: 100 },
            { label: 'Operational Benefit', value: d.scores.operationalBenefit, max: 100 },
            { label: 'Strategic Fit', value: d.scores.strategicFit, max: 100 },
          ]} /></div>
        </div>
      </div>
      {d.affectedStores.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-300 mb-2">Affected Stores</div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-red-500/15 text-red-400 py-2"><div className="text-lg font-bold">{counts.critical}</div>Critical</div>
            <div className="rounded-lg bg-[#C6A35D]/15 text-[#C6A35D] py-2"><div className="text-lg font-bold">{counts.attention}</div>Attention</div>
            <div className="rounded-lg bg-emerald-500/15 text-emerald-400 py-2"><div className="text-lg font-bold">{counts.controlled}</div>Controlled</div>
          </div>
        </div>
      )}
      <div>
        <QuickRow label="Category" value={d.category} />
        <QuickRow label="Owner" value={d.owner} />
        <QuickRow label="Deadline" value={`${d.deadlineDays} day(s)`} />
      </div>
      <RecommendedAction text={d.recommendedAction} />
      <PrimaryButton tone="danger">Review Decision Detail</PrimaryButton>
    </div>
  )
}
