'use client'

import Link from 'next/link'
import { Building2, ClipboardList, ShieldAlert, Truck, Lock, ClipboardCheck, AlertTriangle, ListTodo, Sparkles, Calendar, Banknote } from 'lucide-react'
import type { RegionalDashboardData } from '@/lib/health/data'
import { SectionCard, KpiCard, Pill, Donut, Card, DistributionBar, RagBlocks, STATUS_TEXT, type Kpi } from '@/components/exec/ui'
import { RegionalRecentTickets } from '@/components/regional/RegionalRecentTickets'
import { BriefingRefresh } from '@/components/briefing/BriefingRefresh'
import { Stars } from '@/components/ui/Stars'
import { STATUS_LABELS } from '@/lib/health/constants'
import type { Briefing } from '@/lib/briefing/facts'
import { formatDate, formatCurrency } from '@/lib/utils'

const fmtK = (n: number) => (n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n))

export function RegionalOverview({ data, name, briefing, briefingScopeId }: { data: RegionalDashboardData; name: string | null; briefing?: Briefing; briefingScopeId?: string }) {
  const p = data.portfolio
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' })()

  // Every KPI carries a hint so all cards share the same height → uniform size.
  const kpis: Kpi[] = [
    { label: 'Active Stores', value: p.activeStores, hint: `avg ${p.averageStoreHealth}%`, icon: <Building2 size={13} />, tone: 'info', href: '/regional/stores' },
    { label: 'Stores Need Attention', value: data.attentionStores.length, hint: 'need action', icon: <ShieldAlert size={13} />, tone: data.attentionStores.length ? 'warn' : 'good', href: '/regional/stores' },
    { label: 'Open Tickets', value: p.openTickets, hint: `${p.overdueTickets} overdue`, icon: <ClipboardList size={13} />, tone: 'orange', border: '!ring-orange-500/60', href: '/regional/tickets' },
    { label: 'Pending Signoffs', value: data.signoffsPending, hint: 'awaiting you', icon: <ClipboardCheck size={13} />, tone: data.signoffsPending ? 'warn' : 'good', border: data.signoffsPending ? '!ring-amber-500/60' : '!ring-emerald-500/60', href: '/regional/signoff' },
    { label: 'Open Snags', value: data.snagsOpen, hint: 'to resolve', icon: <AlertTriangle size={13} />, tone: data.snagsOpen ? 'warn' : 'good', href: '/regional/snag' },
    { label: 'Internal Breaches', value: p.internalSlaBreaches, hint: 'internal SLA', icon: <Lock size={13} />, tone: p.internalSlaBreaches ? 'bad' : 'good', href: '/regional/tickets' },
    { label: 'Supplier Breaches', value: p.supplierSlaBreaches, hint: 'supplier SLA', icon: <Truck size={13} />, tone: p.supplierSlaBreaches ? 'bad' : 'good', href: '/regional/suppliers' },
    { label: 'Accepted Quote Value', value: fmtK(data.quoteTotals.accepted), icon: <Banknote size={13} />, tone: 'good', href: '/regional/tickets' },
    { label: 'Pending Quote Value', value: fmtK(data.quoteTotals.pending), icon: <Banknote size={13} />, tone: 'warn', href: '/regional/tickets' },
  ]

  const focus = buildFocus(data)
  const healthy = [...data.stores].filter(s => s.finalStatus === 'controlled').sort((a, b) => b.finalHealthScore - a.finalHealthScore)
  // Stores needing attention, most urgent (lowest health) first.
  const attention = [...data.attentionStores].sort((a, b) => a.finalHealthScore - b.finalHealthScore)

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

      {/* Overall regional health — donut hero with the AI portfolio summary inside */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <Donut value={p.finalPortfolioHealth} status={p.status} size={140} label="Region" />
          <div className="flex-1 min-w-0 w-full space-y-3 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-[var(--text)]">Regional Health</h2>
              <Pill status={p.status} label={STATUS_LABELS[p.status]} />
              {briefingScopeId && <span className="ml-auto"><BriefingRefresh scope="region" scopeId={briefingScopeId} /></span>}
            </div>
            {briefing?.body && (
              <div className="flex items-start gap-2 justify-center sm:justify-start text-left">
                <span className="shrink-0 mt-0.5 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-[#C6A35D] bg-[#C6A35D]/10 rounded-full px-1.5 py-0.5"><Sparkles size={10} /> AI</span>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">{briefing.body}</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
        {kpis.map((k, i) => <KpiCard key={i} kpi={k} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Store Health Distribution" icon={<Building2 size={15} className="text-indigo-600 dark:text-indigo-400" />}>
          <DistributionBar counts={p.counts} />
          <div className="mt-3"><RagBlocks counts={p.counts} unitLabel="stores" /></div>
        </SectionCard>

        <SectionCard title="Supplier Performance" icon={<Truck size={15} className="text-teal-600 dark:text-teal-400" />} action={<Link href="/regional/suppliers" className="text-xs text-[#C6A35D] hover:underline">View all</Link>}>
          {data.suppliers.slice(0, 5).map(s => (
            <Link key={s.id} href={`/regional/supplier-reviews/${s.id}`} className="flex items-center justify-between gap-2 py-2 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
              <div className="min-w-0">
                <p className="text-sm text-[var(--text)] truncate">{s.name}</p>
                <Stars value={s.avgRating} count={s.ratingCount} />
              </div>
              <span className={`text-sm font-semibold shrink-0 ${STATUS_TEXT[s.perf.band]}`}>{s.perf.performanceScore}%</span>
            </Link>
          ))}
          {!data.suppliers.length && <p className="text-sm text-[var(--text-faint)]">No suppliers active in your region yet.</p>}
        </SectionCard>
      </div>

      <SectionCard title="Recommended Focus Today" icon={<ListTodo size={15} className="text-[#C6A35D]" />}>
        {focus.length ? <ul className="space-y-2">{focus.map((f, i) => <li key={i} className="flex items-start gap-2 text-sm text-[var(--text)]">{f.icon}<span>{f.text}</span></li>)}</ul>
          : <p className="text-sm text-[var(--text-faint)]">Nothing urgent — portfolio under control.</p>}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Stores Requiring Attention" icon={<AlertTriangle size={15} className="text-amber-600 dark:text-amber-500" />} action={<Link href="/regional/stores" className="text-xs text-[#C6A35D] hover:underline">View all</Link>}>
          {attention.slice(0, 5).map(s => (
            <div key={s.storeId} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0">
              <div className="min-w-0"><p className="text-sm text-[var(--text)] truncate">{s.storeName}</p><p className="text-[11px] text-[var(--text-faint)] truncate">{s.mainIssue}</p></div>
              <span className="flex items-center gap-2 shrink-0"><span className={`text-sm font-semibold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</span><Pill status={s.finalStatus} /></span>
            </div>
          ))}
          {!data.attentionStores.length && <p className="text-sm text-[var(--text-faint)]">All stores controlled.</p>}
        </SectionCard>
        <SectionCard title="Performing Well" icon={<Sparkles size={15} className="text-emerald-400" />} action={<Link href="/regional/stores" className="text-xs text-[#C6A35D] hover:underline">View all</Link>}>
          {healthy.slice(0, 5).map(s => (
            <div key={s.storeId} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0">
              <p className="text-sm text-[var(--text)] truncate">{s.storeName}</p>
              <span className="text-xs font-semibold text-emerald-400">{s.finalHealthScore}%</span>
            </div>
          ))}
          {!healthy.length && <p className="text-sm text-[var(--text-faint)]">No green stores yet.</p>}
        </SectionCard>
      </div>

      <RegionalRecentTickets tickets={data.tickets} />
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
