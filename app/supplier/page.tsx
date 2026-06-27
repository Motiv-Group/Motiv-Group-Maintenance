export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Truck, ClipboardList, Clock, ReceiptText, ClipboardCheck, Camera, AlertTriangle, Star, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard, type SupplierTicketRow } from '@/lib/health/data'
import { Card, SectionCard, KpiRow, Donut, Pill, type Kpi } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { BriefingRefresh } from '@/components/briefing/BriefingRefresh'
import { getDailyBriefing } from '@/lib/briefing/generate'
import { supplierFacts } from '@/lib/briefing/facts'
import { formatCurrency, formatDateTime, humanizeDuration, rmStatusMeta } from '@/lib/utils'

// Statuses in the Tickets-tab "Quote requested" (to_quote) bucket — keep in sync
// with bucketOf() in components/supplier/SupplierTickets.tsx.
const AWAITING_QUOTE_STATUSES = new Set(['open', 'info_requested', 'assigned', 'assessment', 'quote_requested', 'quote_revision'])

const slaTone = (l: string) =>
  l === 'Breached' ? 'text-red-600 dark:text-red-400'
  : l === 'At risk' ? 'text-amber-600 dark:text-amber-500'
  : l === 'Paused (internal)' ? 'text-[var(--text-faint)]'
  : l === 'Not started' ? 'text-blue-600 dark:text-blue-400'
  : 'text-[var(--text-muted)]'
const QUOTE_TONE: Record<string, string> = { pending: 'text-[#C6A35D]', accepted: 'text-emerald-600 dark:text-emerald-400', declined: 'text-red-600 dark:text-red-400' }

// One date matching the ticket's current stage: approved → requested → assigned.
function milestone(t: SupplierTicketRow): { label: string; at: string } | null {
  if (t.quoteApprovedAt) return { label: 'Quote approved', at: t.quoteApprovedAt }
  if (t.quoteRequestedAt) return { label: 'Quote requested', at: t.quoteRequestedAt }
  if (t.assignedAt) return { label: 'Assigned', at: t.assignedAt }
  return null
}

// Shared ticket row: company + branch, then title, then the stage-matched date.
function TicketRow({ t, company }: { t: SupplierTicketRow; company?: string }) {
  const sm = rmStatusMeta(t.status)
  const m = milestone(t)
  return (
    <Link href={`/supplier/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] -mx-2 px-2 rounded transition">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text)] truncate">{[company, t.storeName].filter(Boolean).join(' · ')}</p>
        <p className="text-[11px] text-[var(--text-muted)] truncate">{t.title}</p>
        {t.overdue && <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">Overdue by {humanizeDuration(Date.now() - new Date(t.dueAt).getTime())}</p>}
        {m && <p className={`text-[11px] ${sm.text}`}>{m.label} · {formatDateTime(m.at)}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_7rem] gap-1.5 shrink-0 justify-items-end sm:justify-items-stretch">
        <PriorityBadge priority={t.priority} className="w-full text-center" />
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${sm.cls}`}>{sm.label}</span>
      </div>
    </Link>
  )
}

export default async function SupplierOverviewPage() {
  const { companyId, supplierIds, fullName } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)
  const k = d.kpis
  const perf = d.perf
  const company = d.company
  const awaitingQuote = d.tickets.filter(t => AWAITING_QUOTE_STATUSES.has(t.status)).length
  const briefingScopeId = supplierIds.slice().sort().join(',')
  const briefing = await getDailyBriefing({ companyId, scope: 'supplier', scopeId: briefingScopeId, role: 'supplier', facts: supplierFacts(d) })

  const kpis: Kpi[] = [
    { label: 'Awaiting Quote', value: awaitingQuote, icon: <ClipboardList size={13} />, tone: 'info', href: '/supplier/tickets?filter=to_quote' },
    { label: 'Overdue', value: k.overdue, icon: <AlertTriangle size={13} />, tone: k.overdue ? 'bad' : 'good', href: '/supplier/tickets?filter=breached' },
    { label: 'Due Today', value: k.dueToday, icon: <Clock size={13} />, tone: k.dueToday ? 'warn' : 'good', href: '/supplier/tickets' },
    { label: 'Pending Quotes', value: k.pendingQuotes, icon: <ReceiptText size={13} />, tone: 'gold', href: '/supplier/quotes' },
    { label: 'Awaiting Sign-off', value: k.awaitingSignoff, icon: <ClipboardCheck size={13} />, tone: 'info', href: '/supplier/signoff' },
    { label: 'Evidence Missing', value: k.evidenceMissing, icon: <Camera size={13} />, tone: k.evidenceMissing ? 'warn' : 'good', href: '/supplier/tickets?filter=evidence' },
  ]

  const needsAction = d.tickets.filter(t => t.active && (t.slaLabel === 'Breached' || t.slaLabel === 'At risk' || !t.acknowledged)).slice(0, 6)
  const evidenceTodo = d.tickets.filter(t => t.active && t.evidenceRequired && !(t.beforeUploaded && t.afterUploaded && t.cocUploaded)).slice(0, 6)
  const recentTickets = [...d.tickets].filter(t => t.status !== 'completed').sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 8)
  const missingBits = (t: SupplierTicketRow) => [!t.beforeUploaded && 'before', !t.afterUploaded && 'after', !t.cocUploaded && 'COC'].filter(Boolean).join(', ')

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Truck className="text-teal-600 dark:text-teal-400" size={22} /> {fullName ?? 'Supplier'}</h1>
          <Link href="/supplier/reviews" className="inline-flex items-center gap-2 shrink-0 rounded-full bg-[var(--surface-2)] ring-1 ring-[#C6A35D]/40 px-4 py-1.5 hover:bg-[var(--hover)] transition" title="View your reviews">
            <Star size={17} className="fill-amber-400 text-amber-400 shrink-0" />
            <span className="text-sm font-bold text-[var(--text)]">{d.rating.avg.toFixed(1)} / 5</span>
            <span className="text-xs text-amber-600 dark:text-amber-400/80">{d.rating.count ? `(${d.rating.count} review${d.rating.count !== 1 ? 's' : ''})` : '(new)'}</span>
          </Link>
        </div>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Your assigned work, quotes, sign-offs and performance.</p>
      </div>

      {/* SLA health hero — donut + AI summary inside (matches RM / SM / Executive) */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <Donut value={perf.performanceScore} status={perf.band} size={140} label="SLA" />
          <div className="flex-1 min-w-0 w-full space-y-3 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-[var(--text)]">SLA Health</h2>
              <Pill status={perf.band} />
              <span className="ml-auto"><BriefingRefresh scope="supplier" scopeId={briefingScopeId} /></span>
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

      <KpiRow kpis={kpis} />

      {/* Row 1: Needs your action · Recent quotes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Needs Your Action" icon={<AlertTriangle size={15} className="text-amber-600 dark:text-amber-500" />} action={<Link href="/supplier/tickets" className="text-xs text-[#C6A35D] hover:underline">All</Link>}>
          {needsAction.map(t => (
            <Link key={t.id} href={`/supplier/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] -mx-2 px-2 rounded">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text)] truncate">{[company, t.storeName].filter(Boolean).join(' · ')}</p>
                <p className="text-[11px] text-[var(--text-muted)] truncate">{t.title}</p>
                <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(t.createdAt)}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <PriorityBadge priority={t.priority} />
                <span className={`text-[11px] font-semibold ${slaTone(t.acknowledged ? t.slaLabel : 'Not started')}`}>{t.acknowledged ? t.slaLabel : 'Awaiting Quote'}</span>
              </div>
            </Link>
          ))}
          {!needsAction.length && <p className="text-sm text-[var(--text-faint)]">Nothing needs action right now.</p>}
        </SectionCard>
        <SectionCard title="Recent Quotes" icon={<ReceiptText size={15} className="text-amber-600 dark:text-amber-500" />} action={<Link href="/supplier/quotes" className="text-xs text-[#C6A35D] hover:underline">All</Link>}>
          {d.quotes.slice(0, 5).map(q => (
            <div key={q.id} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0">
              <div className="min-w-0"><p className="text-sm font-medium text-[var(--text)] truncate">{[company, q.storeName].filter(Boolean).join(' · ')}</p><p className="text-[11px] text-[var(--text-muted)] truncate">{q.ticketTitle}</p><p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(q.createdAt)}</p></div>
              <span className="flex flex-col items-end shrink-0"><span className="text-sm text-[var(--text)]">{formatCurrency(q.amountInclVat ?? q.amount)}</span><span className="text-[10px] text-[var(--text-faint)]">{q.amountInclVat ? 'incl VAT' : 'excl VAT'}</span><span className={`text-[11px] capitalize ${QUOTE_TONE[q.status] ?? 'text-[var(--text-muted)]'}`}>{q.status}</span></span>
            </div>
          ))}
          {!d.quotes.length && <p className="text-sm text-[var(--text-faint)]">No quotes submitted yet.</p>}
        </SectionCard>
      </div>

      {/* Row 2: Evidence to upload · Pending sign-off */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Evidence to Upload" icon={<Camera size={15} className="text-sky-600 dark:text-sky-400" />}>
          {evidenceTodo.map(t => (
            <Link key={t.id} href={`/supplier/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] -mx-2 px-2 rounded">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text)] truncate">{[company, t.storeName].filter(Boolean).join(' · ')}</p>
                <p className="text-[11px] text-[var(--text-muted)] truncate">{t.title}</p>
                <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(t.createdAt)}</p>
              </div>
              <span className="text-[11px] text-amber-600 dark:text-amber-500 shrink-0">missing: {missingBits(t)}</span>
            </Link>
          ))}
          {!evidenceTodo.length && <p className="text-sm text-[var(--text-faint)]">All evidence uploaded.</p>}
        </SectionCard>
        <SectionCard title="Pending Sign-off" icon={<ClipboardCheck size={15} className="text-emerald-600 dark:text-emerald-400" />} action={<Link href="/supplier/signoff" className="text-xs text-[#C6A35D] hover:underline">All</Link>}>
          {d.signoffs.slice(0, 5).map(s => (
            <div key={s.id} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0">
              <div className="min-w-0"><p className="text-sm font-medium text-[var(--text)] truncate">{[company, s.storeName].filter(Boolean).join(' · ')}</p><p className="text-[11px] text-[var(--text-muted)] truncate">{s.ticketTitle}</p><p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(s.createdAt)}</p></div>
              <span className="text-[11px] text-[var(--text-muted)] capitalize shrink-0">{s.status.replace(/_/g, ' ')}</span>
            </div>
          ))}
          {!d.signoffs.length && <p className="text-sm text-[var(--text-faint)]">Nothing awaiting sign-off.</p>}
        </SectionCard>
      </div>

      {/* Recent tickets — moved to the bottom, collapsible */}
      <Card className="p-5">
        <details open className="group">
          <summary className="flex items-center justify-between gap-2 cursor-pointer list-none">
            <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2"><ClipboardList size={15} className="text-blue-600 dark:text-blue-400" /> Recent Tickets</h2>
            <span className="flex items-center gap-1.5 text-[var(--text-faint)]">
              <ChevronDown size={16} className="group-open:hidden" /><ChevronUp size={16} className="hidden group-open:block" />
            </span>
          </summary>
          <div className="mt-4">
            {recentTickets.map(t => <TicketRow key={t.id} t={t} company={company} />)}
            {!recentTickets.length && <p className="text-sm text-[var(--text-faint)]">No tickets yet.</p>}
            {recentTickets.length > 0 && <Link href="/supplier/tickets" className="mt-3 inline-block text-xs text-[#C6A35D] hover:underline">View all tickets →</Link>}
          </div>
        </details>
      </Card>
    </div>
  )
}
