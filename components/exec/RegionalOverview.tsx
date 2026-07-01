'use client'

import Link from 'next/link'
import { Building2, ClipboardList, ShieldAlert, Truck, Lock, ClipboardCheck, AlertTriangle, ListTodo, Sparkles, Calendar, Banknote, Clock, ReceiptText, FileText } from 'lucide-react'
import type { RegionalDashboardData } from '@/lib/health/data'
import { SectionCard, KpiCard, Pill, Donut, Card, DistributionBar, RagBlocks, STATUS_TEXT, type Kpi } from '@/components/exec/ui'
import { RegionalRecentTickets } from '@/components/regional/RegionalRecentTickets'
import { BriefingRefresh } from '@/components/briefing/BriefingRefresh'
import { Stars } from '@/components/ui/Stars'
import { STATUS_LABELS } from '@/lib/health/constants'
import type { Briefing } from '@/lib/briefing/facts'
import { formatDate, formatCurrency } from '@/lib/utils'

const fmtK = (n: number) => (n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n))

// Short, fixed-width status labels for the "Stores Requiring Attention" list so
// every badge is the same size (the default "Attention Required" is too wide).
const ATTN_PILL_LABEL: Record<string, string> = { controlled: 'Controlled', attention: 'Attention', at_risk: 'At Risk', critical: 'Critical' }

export function RegionalOverview({ data, name, briefing, briefingScopeId }: { data: RegionalDashboardData; name: string | null; briefing?: Briefing; briefingScopeId?: string }) {
  const p = data.portfolio
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' })()

  // Quotes waiting on the RM's decision (variation orders get their own KPI below).
  const quotesAwaiting = data.tickets.filter(t => t.status === 'quoted').length
  // Variation orders submitted and waiting on the RM to approve/reject.
  const voAwaiting = data.tickets.filter(t => t.status === 'variation_review').length
  // "Open" = still open/info-requested AND no supplier assigned yet. Once a
  // supplier is on it, it's being handled, not open. Tickets where every supplier
  // declined are counted only by their own KPI. Matches the Tickets-tab pill.
  const openCount = data.tickets.filter(t => (t.status === 'open' || t.status === 'info_requested') && !t.supplierAssigned && !t.allSuppliersDeclined).length
  // "Overdue" = active tickets past their final resolution deadline — same rule as
  // the Tickets-tab Overdue pill. (Distinct from a mid-SLA breach, which the
  // Internal/Supplier Breach KPIs count.)
  const overdueCount = data.tickets.filter(t => t.overdue).length
  // Every invited supplier declined — the RM must re-assign these tickets.
  const supplierDeclinedCount = data.tickets.filter(t => t.allSuppliersDeclined).length

  // Every KPI carries a hint so all cards share the same height → uniform size.
  // Tickets Overdue sits beside Stores Need Attention; Quotes Awaiting Approval
  // beside Open Tickets. Both deep-link into the Tickets tab with the filter set.
  // `actionable` KPIs go green (no border) at 0 and take their tone colour as the
  // border when there's work to do. Active Stores is a plain info metric.
  const kpis: Kpi[] = [
    { label: 'Active Stores', value: p.activeStores, hint: `avg ${p.averageStoreHealth}%`, icon: <Building2 size={13} />, tone: 'info', href: '/regional/stores' },
    { label: 'Stores Need Attention', value: data.attentionStores.length, hint: 'need action', icon: <ShieldAlert size={13} />, tone: 'warn', actionable: true, href: '/regional/stores' },
    { label: 'Tickets Overdue', value: overdueCount, hint: 'past deadline', icon: <Clock size={13} />, tone: 'bad', actionable: true, href: '/regional/tickets?filter=overdue' },
    { label: 'Open Tickets', value: openCount, hint: 'unassigned', icon: <ClipboardList size={13} />, tone: 'orange', actionable: true, href: '/regional/tickets?filter=open' },
    { label: 'Declined by Supplier', value: supplierDeclinedCount, hint: 're-assign', icon: <Truck size={13} />, tone: 'bad', actionable: true, href: '/regional/tickets?filter=supplier_declined' },
    { label: 'Quotes Awaiting Approval', value: quotesAwaiting, hint: 'to review', icon: <ReceiptText size={13} />, tone: 'warn', actionable: true, href: '/regional/tickets?filter=quoted' },
    { label: 'VOs Awaiting Approval', value: voAwaiting, hint: 'to review', icon: <FileText size={13} />, tone: 'warn', actionable: true, href: '/regional/tickets?filter=quoted' },
    { label: 'Pending Signoffs', value: data.signoffsPending, hint: 'awaiting you', icon: <ClipboardCheck size={13} />, tone: 'warn', actionable: true, href: '/regional/signoff' },
    { label: 'Open Snags', value: data.snagsOpen, hint: 'to resolve', icon: <AlertTriangle size={13} />, tone: 'warn', actionable: true, href: '/regional/snag' },
    { label: 'Internal Breaches', value: data.breachesNow.internal, hint: 'internal SLA', icon: <Lock size={13} />, tone: 'bad', actionable: true, href: '/regional/tickets?filter=internal_breach' },
    { label: 'Supplier Breaches', value: data.breachesNow.supplier, hint: 'supplier SLA', icon: <Truck size={13} />, tone: 'bad', actionable: true, href: '/regional/tickets?filter=supplier_breach' },
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

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {kpis.map((k, i) => <KpiCard key={i} kpi={k} />)}
        <QuoteValueCard accepted={data.quoteTotals.accepted} pending={data.quoteTotals.pending} voPending={data.quoteTotals.voPending} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Store Health Distribution" icon={<Building2 size={15} className="text-indigo-600 dark:text-indigo-400" />}>
          <DistributionBar counts={p.counts} />
          <div className="mt-3"><RagBlocks counts={p.counts} unitLabel="stores" /></div>
        </SectionCard>

        <SectionCard title="Supplier Performance" icon={<Truck size={15} className="text-teal-600 dark:text-teal-400" />} action={<Link href="/regional/suppliers" className="text-xs text-[#C6A35D] hover:underline">View all</Link>}>
          {data.suppliers.slice(0, 5).map(s => (
            <Link key={s.id} href={`/regional/suppliers?supplier=${s.id}`} className="flex items-center justify-between gap-2 py-2 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
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
            <Link key={s.storeId} href={`/regional/stores?store=${s.storeId}`} className="flex items-center justify-between gap-2 py-2 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
              <div className="min-w-0"><p className="text-sm text-[var(--text)] truncate">{s.storeName}</p><p className="text-[11px] text-[var(--text-faint)] truncate">{s.mainIssue}</p></div>
              <span className="flex items-center gap-2 shrink-0"><span className={`text-sm font-semibold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</span><Pill status={s.finalStatus} label={ATTN_PILL_LABEL[s.finalStatus]} className="w-24 text-center" /></span>
            </Link>
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

/** Combined quote-value KPI: accepted (incl. approved VOs), pending quotes, and
 *  pending variation orders as their own line. Read-only summary metric. */
function QuoteValueCard({ accepted, pending, voPending }: { accepted: number; pending: number; voPending: number }) {
  return (
    <Card className="p-4 flex flex-col gap-1.5 min-w-0 h-full">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)]"><Banknote size={13} /> Quote Value</div>
      <div className="space-y-1 mt-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Accepted</span>
          <span className="text-sm font-bold text-[var(--text)] tabular-nums">{formatCurrency(accepted)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-amber-600 dark:text-amber-500">Pending</span>
          <span className="text-sm font-bold text-[var(--text)] tabular-nums">{formatCurrency(pending)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-purple-600 dark:text-purple-400">VO pending</span>
          <span className="text-sm font-bold text-[var(--text)] tabular-nums">{formatCurrency(voPending)}</span>
        </div>
      </div>
      <div className="text-[10px] text-[var(--text-faint)] mt-auto pt-1">Accepted incl. approved VOs</div>
    </Card>
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
