'use client'

import Link from 'next/link'
import { Building2, ClipboardList, ShieldAlert, Truck, Lock, ClipboardCheck, AlertTriangle, ListTodo, Sparkles, Calendar, Banknote, CheckCircle2, AlertCircle } from 'lucide-react'
import type { RegionalDashboardData } from '@/lib/health/data'
import { SectionCard, KpiCard, Pill, DistributionBar, STATUS_TEXT, type Kpi } from '@/components/exec/ui'
import { formatDate, formatCurrency } from '@/lib/utils'

const fmtK = (n: number) => (n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n))

export function RegionalOverview({ data, name }: { data: RegionalDashboardData; name: string | null }) {
  const p = data.portfolio
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' })()

  // Every KPI carries a hint so all cards share the same height → uniform size.
  const kpis: Kpi[] = [
    { label: 'Active Stores', value: p.activeStores, hint: `avg ${p.averageStoreHealth}%`, icon: <Building2 size={13} /> },
    { label: 'Stores Need Attention', value: data.attentionStores.length, hint: 'need action', icon: <ShieldAlert size={13} />, tone: data.attentionStores.length ? 'warn' : 'good' },
    { label: 'Open Tickets', value: p.openTickets, hint: `${p.overdueTickets} overdue`, icon: <ClipboardList size={13} /> },
    { label: 'Pending Signoffs', value: data.signoffsPending, hint: 'awaiting you', icon: <ClipboardCheck size={13} />, tone: data.signoffsPending ? 'warn' : 'good' },
    { label: 'Open Snags', value: data.snagsOpen, hint: 'to resolve', icon: <AlertTriangle size={13} />, tone: data.snagsOpen ? 'warn' : 'good' },
    { label: 'Internal Breaches', value: p.internalSlaBreaches, hint: 'internal SLA', icon: <Lock size={13} />, tone: p.internalSlaBreaches ? 'warn' : 'good' },
    { label: 'Supplier Breaches', value: p.supplierSlaBreaches, hint: 'supplier SLA', icon: <Truck size={13} />, tone: p.supplierSlaBreaches ? 'warn' : 'good' },
    { label: 'Cost Exposure', value: fmtK(data.stores.reduce((s, c) => s + c.costExposure, 0)), hint: 'open quote value', icon: <Banknote size={13} /> },
  ]

  const focus = buildFocus(data)
  const healthy = [...data.stores].filter(s => s.finalStatus === 'controlled').sort((a, b) => b.finalHealthScore - a.finalHealthScore)
  const underSuppliers = data.suppliers.filter(s => s.perf.band !== 'controlled').slice(0, 4)
  const bestSupplier = [...data.suppliers].sort((a, b) => b.perf.performanceScore - a.perf.performanceScore)[0]

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">{greeting}, {name?.split(' ')[0] ?? 'Manager'} 👋</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Regional portfolio overview</p>
        </div>
        <span className="flex items-center gap-2 text-xs text-[var(--text-muted)] bg-[var(--surface)] ring-1 ring-[var(--border)] rounded-xl px-3 py-2 self-start sm:self-auto">
          <Calendar size={14} className="text-[var(--text-muted)]" />
          {formatDate(data.generatedAt)}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
        {kpis.map((k, i) => <KpiCard key={i} kpi={k} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Store Health Distribution" icon={<Building2 size={15} className="text-indigo-600 dark:text-indigo-400" />}>
          <DistributionBar counts={p.counts} />
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
            <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className="w-2 h-2 rounded-full bg-emerald-500" />Controlled {p.counts.controlled}</span>
            <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className="w-2 h-2 rounded-full bg-[#C6A35D]" />Attention {p.counts.attention}</span>
            <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className="w-2 h-2 rounded-full bg-red-400" />At Risk {p.counts.at_risk}</span>
            <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className="w-2 h-2 rounded-full bg-red-800" />Critical {p.counts.critical}</span>
          </div>
        </SectionCard>

        <SectionCard title="Supplier Performance" icon={<Truck size={15} className="text-teal-600 dark:text-teal-400" />} action={<Link href="/regional/suppliers" className="text-xs text-[#C6A35D] hover:underline">All</Link>}>
          {bestSupplier && (
            <div className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)]">
              <span className="flex items-center gap-1.5 text-sm text-[var(--text)] min-w-0"><CheckCircle2 size={14} className="text-emerald-500 shrink-0" /><span className="truncate">{bestSupplier.name}</span></span>
              <span className={`text-sm font-semibold shrink-0 ${STATUS_TEXT[bestSupplier.perf.band]}`}>{bestSupplier.perf.performanceScore}%</span>
            </div>
          )}
          {underSuppliers.map(s => (
            <div key={s.id} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0">
              <span className="flex items-center gap-1.5 text-sm text-[var(--text)] min-w-0"><AlertCircle size={14} className="text-red-400 shrink-0" /><span className="truncate">{s.name}</span><span className="text-[11px] text-[var(--text-faint)] shrink-0">{s.overdue} overdue</span></span>
              <span className={`text-sm font-semibold shrink-0 ${STATUS_TEXT[s.perf.band]}`}>{s.perf.performanceScore}%</span>
            </div>
          ))}
          {!data.suppliers.length && <p className="text-sm text-[var(--text-faint)]">No suppliers active in your region yet.</p>}
        </SectionCard>
      </div>

      <SectionCard title="Recommended Focus Today" icon={<ListTodo size={15} className="text-[#C6A35D]" />}>
        {focus.length ? <ul className="space-y-2">{focus.map((f, i) => <li key={i} className="flex items-start gap-2 text-sm text-[var(--text)]">{f.icon}<span>{f.text}</span></li>)}</ul>
          : <p className="text-sm text-[var(--text-faint)]">Nothing urgent — portfolio under control.</p>}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Stores Requiring Attention" icon={<AlertTriangle size={15} className="text-amber-600 dark:text-amber-500" />} action={<Link href="/regional/stores" className="text-xs text-[#C6A35D] hover:underline">All</Link>}>
          {data.attentionStores.slice(0, 8).map(s => (
            <div key={s.storeId} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0">
              <div className="min-w-0"><p className="text-sm text-[var(--text)] truncate">{s.storeName}</p><p className="text-[11px] text-[var(--text-faint)] truncate">{s.mainIssue}</p></div>
              <span className="flex items-center gap-2 shrink-0"><span className={`text-sm font-semibold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</span><Pill status={s.finalStatus} /></span>
            </div>
          ))}
          {!data.attentionStores.length && <p className="text-sm text-[var(--text-faint)]">All stores controlled.</p>}
        </SectionCard>
        <SectionCard title="Performing Well" icon={<Sparkles size={15} className="text-emerald-400" />}>
          {healthy.slice(0, 8).map(s => (
            <div key={s.storeId} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0">
              <p className="text-sm text-[var(--text)] truncate">{s.storeName}</p>
              <span className="text-xs font-semibold text-emerald-400">{s.finalHealthScore}%</span>
            </div>
          ))}
          {!healthy.length && <p className="text-sm text-[var(--text-faint)]">No green stores yet.</p>}
        </SectionCard>
      </div>

      <SectionCard title="Tickets Needing Action" icon={<ClipboardList size={15} className="text-blue-600 dark:text-blue-400" />} action={<Link href="/regional/tickets" className="text-xs text-[#C6A35D] hover:underline">All tickets</Link>}>
        {data.ticketActions.slice(0, 6).map(t => (
          <div key={t.id} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0">
            <div className="min-w-0"><p className="text-sm text-[var(--text)] truncate">{t.storeName} · <span className="text-[var(--text-muted)]">{t.priority}</span></p><p className="text-[11px] text-[var(--text-faint)] truncate">{t.nextAction}</p></div>
            <span className="text-[11px] text-[var(--text-muted)] shrink-0">{t.slaLabel} · {t.ageDays}d</span>
          </div>
        ))}
        {!data.ticketActions.length && <p className="text-sm text-[var(--text-faint)]">No open tickets needing action.</p>}
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
