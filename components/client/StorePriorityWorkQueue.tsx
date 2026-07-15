'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Info,
  Loader2,
} from 'lucide-react'
import type { StoreManagerTicket } from '@/lib/health/data'
import { Card } from '@/components/exec/ui'
import { AddInfoModal } from '@/components/client/AddInfoModal'
import { formatDate, formatJobId, humanizeDuration, PRIORITY_LEVEL_LABELS } from '@/lib/utils'
import { CategoryIcon } from '@/components/client/ticketBadges'

type TodayVisit = {
  id: string
  title: string
  supplier: string
  scheduledAt: string
  proposed: boolean
}

// Filters are driven only by the KPI cards now — 'all' is the default, unfiltered view.
type QueueFilter = 'all' | 'open' | 'today' | 'input' | 'progress'
type Tone = 'red' | 'purple' | 'gold' | 'green' | 'orange'

const URGENCY_RANK: Record<string, number> = { urgent: 0, P1: 0, high: 1, P2: 1, medium: 2, P3: 2, low: 3, P4: 3 }
const SIGNOFF_STATUSES = new Set(['submitted_for_signoff', 'pending_sign_off', 'evidence_requested', 'approved_closeout'])
const SNAG_STATUSES = new Set(['snag', 'snag_assigned', 'snag_in_progress', 'snag_resolved'])

export function StorePriorityWorkQueue({
  tickets,
  todayVisits,
  storeName,
  generatedAt,
}: {
  tickets: StoreManagerTicket[]
  todayVisits: TodayVisit[]
  storeName: string
  generatedAt: string
}) {
  const [filter, setFilter] = useState<QueueFilter>('all')
  const nowMs = new Date(generatedAt).getTime()
  const todayVisitIds = useMemo(() => new Set(todayVisits.map(v => v.id)), [todayVisits])
  const activeTickets = useMemo(() => tickets.filter(t => t.status !== 'completed' && t.status !== 'cancelled'), [tickets])

  const counts = useMemo(() => {
    const open = activeTickets.length
    const input = tickets.filter(t => t.status === 'info_requested').length
    const progress = tickets.filter(t => t.status === 'in_progress').length
    const urgent = activeTickets.filter(t => isUrgent(t)).length
    return { open, input, progress, urgent, today: todayVisitIds.size }
  }, [activeTickets, tickets, todayVisitIds])

  const rows = useMemo(() => {
    // Urgency first, then most recently logged ticket.
    return activeTickets
      .filter(t => matchesFilter(t, filter, todayVisitIds))
      .sort((a, b) =>
        (URGENCY_RANK[String(a.priority)] ?? 9) - (URGENCY_RANK[String(b.priority)] ?? 9)
        || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      // Cap the queue at the top 5 — the rest live behind "View all tickets".
      .slice(0, 5)
  }, [activeTickets, filter, todayVisitIds])

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricButton
          active={filter === 'open'}
          icon={<CircleAlert size={21} />}
          tone="red"
          label="Open Tickets"
          value={counts.open}
          sub={`${counts.urgent} urgent`}
          subActive={counts.urgent > 0}
          onClick={() => setFilter('open')}
        />
        <MetricButton
          active={filter === 'today'}
          icon={<CalendarClock size={21} />}
          tone="purple"
          label="Supplier Coming Today"
          value={counts.today}
          sub={counts.today ? `${counts.today} visit${counts.today === 1 ? '' : 's'} booked` : 'No visits booked'}
          subActive={counts.today > 0}
          onClick={() => setFilter('today')}
        />
        <MetricButton
          active={filter === 'input'}
          icon={<Info size={21} />}
          tone="orange"
          label="Needs Your Input"
          value={counts.input}
          sub={counts.input === 1 ? '1 job to update' : `${counts.input} jobs to update`}
          subActive={counts.input > 0}
          onClick={() => setFilter('input')}
        />
        <MetricButton
          active={filter === 'progress'}
          icon={<Loader2 size={21} />}
          tone="gold"
          label="In Progress"
          value={counts.progress}
          sub="Being worked on"
          subActive={counts.progress > 0}
          onClick={() => setFilter('progress')}
        />
      </section>

      <Card className="overflow-hidden p-0">
        <div className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-600/15 text-blue-600 dark:text-blue-300">
            <ClipboardList size={21} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-[var(--text)]">Priority Work Queue</h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Sorted by urgency, then most recent</p>
          </div>
        </div>

        <div className="px-4 py-4 sm:px-5">
          <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            {rows.length ? rows.map(t => (
              <QueueRow key={t.id} ticket={t} storeName={storeName} nowMs={nowMs} />
            )) : (
              <div className="px-4 py-10">
                <EmptyQueue filter={filter} />
              </div>
            )}
            <div className="border-t border-[var(--border)] px-4 py-4">
              <Link href="/client/tickets" className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:underline dark:text-blue-400">
                View all priority work <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

function MetricButton({
  active,
  icon,
  tone,
  label,
  value,
  sub,
  subActive,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  tone?: Tone
  label: string
  value: number
  sub: string
  subActive: boolean
  onClick: () => void
}) {
  const zero = value === 0
  // Icon chip, value, border and the (active) sub-line all share ONE state colour:
  // green when the count is 0 (all clear), amber when there's work outstanding.
  const stateText = zero ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
  const iconChip = zero ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/20'
  const stateBorder = zero ? 'border-2 border-[var(--border)] dark:border-white/10' : 'border-2 border-amber-500/70'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`block rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${active ? 'ring-2 ring-blue-500/70' : ''}`}
    >
      <Card className={`h-full p-4 transition hover:-translate-y-0.5 hover:ring-blue-500/30 ${stateBorder} ${active ? 'ring-blue-500/60' : ''}`}>
        <div className="flex items-center gap-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ring-1 ${iconChip}`}>{icon}</span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[var(--text-muted)]">{label}</p>
            <p className={`mt-1 text-2xl font-bold leading-none ${stateText}`}>{value}</p>
            <p className={`mt-1 truncate text-xs font-semibold ${subActive ? stateText : 'text-[var(--text-faint)]'}`}>{sub}</p>
          </div>
        </div>
      </Card>
    </button>
  )
}

function QueueRow({ ticket, storeName, nowMs }: { ticket: StoreManagerTicket; storeName: string; nowMs: number }) {
  const dueMs = Math.max(0, new Date(ticket.dueAt).getTime() - nowMs)
  const ticketUrl = `/client/tickets/${ticket.id}`
  const needsInfo = ticket.status === 'info_requested'
  // The CTA sits above the whole-row link (z-20) so its click opens the modal /
  // navigates on its own instead of triggering the row's "view ticket" link.
  // Genuinely critical (P1 / urgent) tickets get a RED action button so they stand out.
  const critical = ['P1', 'urgent'].includes(String(ticket.priority))
  const ctaCls = `relative z-20 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition lg:w-40 ${critical ? 'border-red-500/60 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-300' : 'border-blue-500/60 text-blue-600 hover:bg-blue-500/10 dark:text-blue-300'}`
  const jobId = ticket.jobRef ?? formatJobId(ticket.jobNumber)

  return (
    <div className="relative grid gap-4 border-b border-[var(--border)] px-4 py-4 transition last:border-b-0 hover:bg-[var(--hover)] lg:grid-cols-[1fr_200px_1.1fr_160px] lg:items-center">
      {/* The whole row (except the CTA island) links to the ticket. */}
      <Link href={ticketUrl} aria-label={`View ${ticket.category || ticket.title} ticket`} className="absolute inset-0 z-10" />

      <div className="flex min-w-0 items-center gap-3">
        <CategoryIcon category={ticket.category ?? ticket.title} priority={ticket.priority} />
        <div className="min-w-0">
          {jobId && <p className="truncate font-mono text-[10px] text-[var(--text-faint)]">{jobId}</p>}
          <p className="truncate text-base font-bold text-[var(--text)]">{ticket.category || ticket.title}</p>
          <p className="truncate text-sm text-[var(--text-muted)]">{storeName}</p>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex w-[72px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${priorityBadgeClass(ticket)}`}>{priorityLabel(ticket)}</span>
          <span className={`inline-flex w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${clientStatusBadgeClass(ticket)}`}>{clientStatusLabel(ticket)}</span>
        </div>
        <p className="mt-1.5 truncate text-sm text-[var(--text-muted)]">{ticket.supplierAssigned ? 'Supplier assigned' : 'No supplier assigned'}</p>
      </div>

      <div className="min-w-0 border-l-0 border-[var(--border)] lg:border-l lg:pl-6">
        <p className="truncate text-xs text-[var(--text-muted)]">Next step · Logged {formatDate(ticket.createdAt)}</p>
        <p className="truncate text-sm font-bold text-[var(--text)]">{nextStep(ticket)}</p>
        {ticket.overdue ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-red-600 dark:text-red-400">
            <AlertCircle size={14} /> SLA breached
          </p>
        ) : (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
            <CalendarClock size={14} /> Due in {humanizeDuration(dueMs)}
          </p>
        )}
      </div>

      <div className="flex lg:justify-end">
        {needsInfo ? (
          <AddInfoModal
            ticketId={ticket.id}
            title={ticket.title}
            description={ticket.description ?? ''}
            category={ticket.category ?? 'General'}
            impact={ticket.operationalImpact ?? 'none'}
            photoUrls={ticket.photoUrls}
            docUrls={ticket.infoDocUrls}
            requestReason={ticket.infoRequestReason}
            trigger={open => <button type="button" onClick={open} className={ctaCls}>Add Info <ArrowRight size={15} /></button>}
          />
        ) : (
          <Link href={ticketUrl} className={ctaCls}>View Ticket <ArrowRight size={15} /></Link>
        )}
      </div>
    </div>
  )
}

function EmptyQueue({ filter }: { filter: QueueFilter }) {
  const copy = filter === 'today' ? 'No supplier visits booked for today.'
    : filter === 'input' ? 'Nothing waiting on you.'
    : filter === 'progress' ? 'No tickets are in progress.'
    : 'No tickets match this queue.'
  return (
    <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center">
      <div>
        <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-faint)]">
          <CheckCircle2 size={24} />
        </div>
        <p className="text-sm font-semibold text-[var(--text-muted)]">{copy}</p>
      </div>
    </div>
  )
}

function matchesFilter(ticket: StoreManagerTicket, filter: QueueFilter, todayVisitIds: Set<string>): boolean {
  switch (filter) {
    case 'all':
    case 'open':
      return true
    case 'today':
      return todayVisitIds.has(ticket.id)
    case 'input':
      return ticket.status === 'info_requested'
    case 'progress':
      return ticket.status === 'in_progress'
  }
}

function isUrgent(ticket: StoreManagerTicket): boolean {
  const p = String(ticket.priority)
  return ticket.overdue || p === 'urgent' || p === 'P1'
}

function priorityLabel(ticket: StoreManagerTicket): string {
  return PRIORITY_LEVEL_LABELS[String(ticket.priority)] ?? 'Medium'
}

// Priority badge colour — handles both the engine's P1–P4 and classic words.
function priorityBadgeClass(ticket: StoreManagerTicket): string {
  const p = String(ticket.priority)
  if (p === 'urgent' || p === 'P1') return 'bg-red-500/15 text-red-600 dark:text-red-400'
  if (p === 'high' || p === 'P2') return 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
  if (p === 'medium' || p === 'P3') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  return 'bg-slate-500/15 text-slate-600 dark:text-slate-300' // low / P4
}

function clientStatusLabel(ticket: StoreManagerTicket): string {
  if (ticket.infoAdded) return 'Info added'
  switch (ticket.status) {
    case 'open':           return 'New'
    case 'info_requested': return 'Input needed'
    case 'scheduled':      return 'Scheduled'
    case 'in_progress':    return 'In progress'
    case 'completed':      return 'Completed'
    case 'cancelled':      return 'Cancelled'
    default:               return String(ticket.status).replace(/_/g, ' ')
  }
}

function clientStatusBadgeClass(ticket: StoreManagerTicket): string {
  if (ticket.infoAdded || ticket.status === 'info_requested') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  switch (ticket.status) {
    case 'in_progress': return 'bg-[#f59e0b]/15 text-amber-700 dark:text-[#f59e0b]'
    case 'completed':   return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
    case 'scheduled':   return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400'
    case 'cancelled':   return 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
    default:            return 'bg-blue-500/15 text-blue-600 dark:text-blue-400' // open / New
  }
}

function nextStep(ticket: StoreManagerTicket): string {
  if (ticket.status === 'info_requested') return 'Add the information requested by your manager'
  if (SNAG_STATUSES.has(ticket.rawStatus)) return 'Snag is being handled by the supplier'
  if (SIGNOFF_STATUSES.has(ticket.rawStatus)) return 'Sign-off is being reviewed'
  if (ticket.status === 'scheduled') return 'Supplier visit is scheduled'
  if (ticket.status === 'in_progress') return 'Supplier is working on this ticket'
  if (!ticket.supplierAssigned) return 'New ticket - waiting for manager review'
  return 'Track progress on this ticket'
}
