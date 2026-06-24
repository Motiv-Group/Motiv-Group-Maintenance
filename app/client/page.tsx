export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { PlusCircle, Calendar, ClipboardList, Wrench, CheckCircle2, AlertTriangle, ListTodo, Sparkles } from 'lucide-react'
import { requireStoreManagerV3 } from '@/lib/health/guard'
import { assembleStoreManagerDashboard } from '@/lib/health/data'
import { STATUS_LABELS } from '@/lib/health/constants'
import { Card, Donut, Pill, KpiCard, SectionCard, type Kpi } from '@/components/exec/ui'
import { RecentTicketsCard } from '@/components/client/RecentTicketsCard'
import { getDailyBriefing } from '@/lib/briefing/generate'
import { storeFacts } from '@/lib/briefing/facts'
import { formatDate } from '@/lib/utils'

export default async function StoreOverviewPage() {
  const { companyId, storeIds, fullName } = await requireStoreManagerV3()
  const d = await assembleStoreManagerDashboard(companyId, storeIds)
  const h = d.health
  const briefingScopeId = storeIds.slice().sort().join(',')
  const briefing = await getDailyBriefing({ companyId, scope: 'store', scopeId: briefingScopeId, role: 'store_manager', facts: storeFacts(d) })
  const greeting = (() => { const x = new Date().getHours(); return x < 12 ? 'Good morning' : x < 17 ? 'Good afternoon' : 'Good evening' })()

  // Store managers only ever see ticket status — never money or quotes.
  const kpis: Kpi[] = [
    { label: 'Open', value: d.open, icon: <ClipboardList size={13} />, href: '/client/tickets?status=open' },
    { label: 'In Progress', value: d.inProgress, icon: <Wrench size={13} />, href: '/client/tickets?status=in_progress' },
    { label: 'Completed', value: d.completed, icon: <CheckCircle2 size={13} />, tone: 'good', href: '/client/tickets?status=completed' },
    { label: 'Overdue', value: h?.overdueTickets ?? 0, icon: <AlertTriangle size={13} />, tone: (h?.overdueTickets ?? 0) ? 'bad' : 'good', href: '/client/tickets' },
  ]

  // Status-only prompts — no safety / info-request / quote / money items.
  const actions: { icon: React.ReactNode; text: string }[] = []
  if ((h?.overdueTickets ?? 0) > 0) actions.push({ icon: <AlertTriangle size={15} className="text-amber-500 mt-0.5 shrink-0" />, text: `${h!.overdueTickets} ticket${h!.overdueTickets > 1 ? 's' : ''} past target — the team is following up.` })

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text)]">{greeting}, {fullName?.split(' ')[0] ?? 'there'} 👋</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5 flex items-center gap-2 min-w-0">
            <span className="truncate">{d.branch}</span>
            {d.branchCode && <span className="inline-flex items-center shrink-0 rounded-md bg-[var(--surface)] ring-1 ring-[var(--border)] px-2 py-0.5 text-[11px] font-mono font-semibold tracking-wider text-[var(--text)]">{d.branchCode}</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Link href="/client/tickets/new" className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition">
            <PlusCircle size={16} /> Log a Ticket
          </Link>
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] bg-[var(--surface)] ring-1 ring-[var(--border)] rounded-xl px-2.5 py-1">
            <Calendar size={12} className="text-[var(--text-muted)]" />
            {formatDate(d.generatedAt)}
          </span>
        </div>
      </div>

      {/* Store health + AI summary */}
      {h && (
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <Donut value={h.finalHealthScore} status={h.finalStatus} size={140} label="Store" />
            <div className="flex-1 min-w-0 w-full space-y-3 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-[var(--text)]">Store Health</h2>
                <Pill status={h.finalStatus} label={STATUS_LABELS[h.finalStatus]} />
              </div>
              {briefing?.body && (
                <div className="flex items-start gap-2 justify-center sm:justify-start text-left">
                  <span className="shrink-0 mt-0.5 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-[#C6A35D] bg-[#C6A35D]/10 rounded-full px-1.5 py-0.5">
                    <Sparkles size={10} /> AI
                  </span>
                  <p className="text-sm text-[var(--text-muted)] leading-relaxed">{briefing.body}</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k, i) => <KpiCard key={i} kpi={k} />)}
      </div>

      {/* Recommended actions */}
      <SectionCard title="What needs your attention" icon={<ListTodo size={15} className="text-[#C6A35D]" />}>
        {actions.length
          ? <ul className="space-y-2">{actions.map((a, i) => <li key={i} className="flex items-start gap-2 text-sm text-[var(--text)]">{a.icon}<span>{a.text}</span></li>)}</ul>
          : <p className="text-sm text-[var(--text-faint)]">Nothing needs your attention — your store is under control.</p>}
      </SectionCard>

      <RecentTicketsCard tickets={d.tickets} />
    </div>
  )
}
