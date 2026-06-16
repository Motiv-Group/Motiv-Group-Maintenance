'use client'

import Link from 'next/link'
import { LayoutDashboard, Building2, ClipboardList, ShieldAlert, Truck, Lock, ClipboardCheck, AlertTriangle, ListTodo, CheckCircle2, Sparkles } from 'lucide-react'
import type { RegionalDashboardData } from '@/lib/health/data'
import { STATUS_LABELS } from '@/lib/health/constants'
import { Card, SectionCard, KpiRow, Donut, Pill, DistributionChips, STATUS_TEXT, type Kpi } from '@/components/exec/ui'

export function RegionalOverview({ data, name }: { data: RegionalDashboardData; name: string | null }) {
  const p = data.portfolio
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' })()

  const kpis: Kpi[] = [
    { label: 'Portfolio Health', value: `${p.finalPortfolioHealth}%`, hint: STATUS_LABELS[p.status], icon: <LayoutDashboard size={13} />, tone: p.status === 'controlled' ? 'good' : p.status === 'attention' ? 'warn' : 'bad' },
    { label: 'Active Stores', value: p.activeStores, hint: `avg ${p.averageStoreHealth}%`, icon: <Building2 size={13} /> },
    { label: 'Open Tickets', value: p.openTickets, hint: `${p.overdueTickets} overdue`, icon: <ClipboardList size={13} /> },
    { label: 'Supplier Breaches', value: p.supplierSlaBreaches, icon: <Truck size={13} />, tone: p.supplierSlaBreaches ? 'warn' : 'good' },
    { label: 'Internal Breaches', value: p.internalSlaBreaches, icon: <Lock size={13} />, tone: p.internalSlaBreaches ? 'warn' : 'good' },
    { label: 'Pending Signoffs', value: data.signoffsPending, icon: <ClipboardCheck size={13} />, tone: data.signoffsPending ? 'warn' : 'good' },
    { label: 'Open Snags', value: data.snagsOpen, icon: <AlertTriangle size={13} />, tone: data.snagsOpen ? 'warn' : 'good' },
    { label: 'Stores Need Attention', value: data.attentionStores.length, icon: <ShieldAlert size={13} />, tone: data.attentionStores.length ? 'warn' : 'good' },
  ]

  const focus = buildFocus(data)
  const healthy = [...data.stores].filter(s => s.finalStatus === 'controlled').sort((a, b) => b.finalHealthScore - a.finalHealthScore)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">{greeting}, {name?.split(' ')[0] ?? 'Manager'} 👋</h1>
        <p className="text-sm text-slate-400 mt-0.5">Regional portfolio overview · {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <Donut value={p.finalPortfolioHealth} status={p.status} size={140} label="Portfolio" />
          <div className="flex-1 min-w-0 space-y-3 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap"><h2 className="text-lg font-bold text-white">Portfolio Health</h2><Pill status={p.status} label={STATUS_LABELS[p.status]} /></div>
            <p className="text-sm text-slate-300">Average store health {p.averageStoreHealth}% − penalty {p.riskPenalty} = <strong className={STATUS_TEXT[p.status]}>{p.finalPortfolioHealth}%</strong>. {p.mainReason}.</p>
            {p.appliedPenalties.length > 0 && <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start">{p.appliedPenalties.map((x, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-300">{x}</span>)}</div>}
            <DistributionChips counts={p.counts} />
          </div>
        </div>
      </Card>

      <KpiRow kpis={kpis} />

      <SectionCard title="Recommended Focus Today" icon={<ListTodo size={15} className="text-[#C6A35D]" />}>
        {focus.length ? <ul className="space-y-2">{focus.map((f, i) => <li key={i} className="flex items-start gap-2 text-sm text-slate-200">{f.icon}<span>{f.text}</span></li>)}</ul>
          : <p className="text-sm text-slate-500">Nothing urgent — portfolio under control.</p>}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Stores Requiring Attention" icon={<AlertTriangle size={15} className="text-[#C6A35D]" />} action={<Link href="/regional/stores" className="text-xs text-[#C6A35D] hover:underline">All</Link>}>
          {data.attentionStores.slice(0, 8).map(s => (
            <div key={s.storeId} className="flex items-center justify-between gap-2 py-2 border-b border-white/5 last:border-0">
              <div className="min-w-0"><p className="text-sm text-white truncate">{s.storeName}</p><p className="text-[11px] text-slate-500 truncate">{s.mainIssue}</p></div>
              <span className="flex items-center gap-2 shrink-0"><span className={`text-sm font-semibold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</span><Pill status={s.finalStatus} /></span>
            </div>
          ))}
          {!data.attentionStores.length && <p className="text-sm text-slate-500">All stores controlled.</p>}
        </SectionCard>
        <SectionCard title="Performing Well" icon={<Sparkles size={15} className="text-emerald-400" />}>
          {healthy.slice(0, 8).map(s => (
            <div key={s.storeId} className="flex items-center justify-between gap-2 py-2 border-b border-white/5 last:border-0">
              <p className="text-sm text-white truncate">{s.storeName}</p>
              <span className="text-xs font-semibold text-emerald-400">{s.finalHealthScore}%</span>
            </div>
          ))}
          {!healthy.length && <p className="text-sm text-slate-500">No green stores yet.</p>}
        </SectionCard>
      </div>

      <SectionCard title="Tickets Needing Action" icon={<ClipboardList size={15} className="text-[#C6A35D]" />} action={<Link href="/regional/tickets" className="text-xs text-[#C6A35D] hover:underline">All tickets</Link>}>
        {data.ticketActions.slice(0, 6).map(t => (
          <div key={t.id} className="flex items-center justify-between gap-2 py-2 border-b border-white/5 last:border-0">
            <div className="min-w-0"><p className="text-sm text-white truncate">{t.storeName} · <span className="text-slate-400">{t.priority}</span></p><p className="text-[11px] text-slate-500 truncate">{t.nextAction}</p></div>
            <span className="text-[11px] text-slate-300 shrink-0">{t.slaLabel} · {t.ageDays}d</span>
          </div>
        ))}
        {!data.ticketActions.length && <p className="text-sm text-slate-500">No open tickets needing action.</p>}
      </SectionCard>
    </div>
  )
}

function buildFocus(data: RegionalDashboardData) {
  const out: { icon: React.ReactNode; text: string }[] = []
  const crit = data.attentionStores.filter(s => s.finalStatus === 'critical').slice(0, 3)
  if (crit.length) out.push({ icon: <ShieldAlert size={15} className="text-red-400 mt-0.5 shrink-0" />, text: `Escalate critical store(s): ${crit.map(s => s.storeName).join(', ')}` })
  const red = data.attentionStores.filter(s => s.finalStatus === 'at_risk').slice(0, 3)
  if (red.length) out.push({ icon: <Building2 size={15} className="text-[#C6A35D] mt-0.5 shrink-0" />, text: `Follow up: ${red.map(s => s.storeName).join(', ')}` })
  if (data.signoffsPending) out.push({ icon: <ClipboardCheck size={15} className="text-[#C6A35D] mt-0.5 shrink-0" />, text: `${data.signoffsPending} job(s) awaiting your sign-off` })
  if (data.snagsOpen) out.push({ icon: <AlertTriangle size={15} className="text-[#C6A35D] mt-0.5 shrink-0" />, text: `${data.snagsOpen} open snag(s) to resolve` })
  const badSup = data.suppliers.find(s => s.perf.band === 'at_risk' || s.perf.band === 'critical')
  if (badSup) out.push({ icon: <Truck size={15} className="text-[#C6A35D] mt-0.5 shrink-0" />, text: `Follow up supplier ${badSup.name} (${badSup.perf.slaBreaches} breaches)` })
  return out
}
