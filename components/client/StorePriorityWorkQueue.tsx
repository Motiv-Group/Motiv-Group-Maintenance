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
import { humanizeDuration, PRIORITY_LEVEL_LABELS } from '@/lib/utils'
import { categoryVisual } from '@/lib/categoryVisual'

type TodayVisit = {
  id: string
  title: string
  supplier: string
  scheduledAt: string
  proposed: boolean
}

// Filters are driven only by the KPI cards now — 'all' is the default, unfiltered view.
type QueueFilter = 'all' | 'open' | 'today' | 'input' | 'progress'
type Tone = 'red' | 'purple' | 'gold' | 'green'

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
          onClick={() => setFilter('open')}
        />
        <MetricButton
          active={filter === 'today'}
          icon={<CalendarClock size={21} />}
          tone="purple"
          label="Supplier Coming Today"
          value={counts.today}
          sub={counts.today ? `${counts.today} visit${counts.today === 1 ? '' : 's'} booked` : 'No visits booked'}
          onClick={() => setFilter('today')}
        />
        <MetricButton
          active={filter === 'input'}
          icon={<Info size={21} />}
          tone="gold"
          label="Needs Your Input"
          value={counts.input}
          sub={counts.input === 1 ? '1 job to update' : `${counts.input} jobs to update`}
          onClick={() => setFilter('input')}
        />
        <MetricButton
          active={filter === 'progress'}
          icon={<Loader2 size={21} />}
          tone="green"
          label="In Progress"
          value={counts.progress}
          sub="Being worked on"
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
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  tone: Tone
  label: string
  value: number
  sub: string
  onClick: () => void
}) {
  const tones: Record<Tone, string> = {
    red: 'bg-red-500/15 text-red-600 dark:text-red-300 ring-red-500/20',
    purple: 'bg-purple-500/15 text-purple-600 dark:text-purple-300 ring-purple-500/20',
    gold: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D] ring-[#C6A35D]/20',
    green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20',
  }
  const subColor = tone === 'red' ? 'text-red-600 dark:text-red-400'
    : tone === 'gold' ? 'text-amber-600 dark:text-[#C6A35D]'
    : tone === 'green' ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-[var(--text-muted)]'

  // Green = all clear (zero), amber = has tickets that need attention.
  const zero = value === 0
  const valueColor = zero ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
  const stateBorder = zero ? 'border-2 border-emerald-500/60' : 'border-2 border-amber-500/70'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`block rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${active ? 'ring-2 ring-blue-500/70' : ''}`}
    >
      <Card className={`h-full p-4 transition hover:-translate-y-0.5 hover:ring-blue-500/30 ${stateBorder} ${active ? 'ring-blue-500/60' : ''}`}>
        <div className="flex items-center gap-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ring-1 ${tones[tone]}`}>{icon}</span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[var(--text-muted)]">{label}</p>
            <p className={`mt-1 text-2xl font-bold leading-none ${valueColor}`}>{value}</p>
            <p className={`mt-1 truncate text-xs font-semibold ${subColor}`}>{sub}</p>
          </div>
        </div>
      </Card>
    </button>
  )
}

function QueueRow({ ticket, storeName, nowMs }: { ticket: StoreManagerTicket; storeName: string; nowMs: number }) {
  const overdueMs = ticket.overdue ? Math.max(0, nowMs - new Date(ticket.dueAt).getTime()) : 0
  const dueMs = Math.max(0, new Date(ticket.dueAt).getTime() - nowMs)
  const cta = ticket.status === 'info_requested' ? 'Add Info' : 'View Ticket'

  return (
    <Link href={`/client/tickets/${ticket.id}`} className="grid gap-4 border-b border-[var(--border)] px-4 py-4 transition last:border-b-0 hover:bg-[var(--hover)] lg:grid-cols-[1fr_180px_1.1fr_160px] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <CategoryIcon category={ticket.category ?? ticket.title} />
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-[var(--text)]">{ticket.category || ticket.title}</p>
          <p className="truncate text-sm text-[var(--text-muted)]">{storeName}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:block">
        <span className={`inline-flex rounded-lg px-3 py-1 text-xs font-bold ${statusPill(ticket)}`}>{statusLabel(ticket)}</span>
        <p className="mt-0 text-sm text-[var(--text-muted)] lg:mt-2">{ticket.supplierAssigned ? 'Supplier assigned' : 'No supplier assigned'}</p>
      </div>

      <div className="min-w-0 border-l-0 border-[var(--border)] lg:border-l lg:pl-6">
        <p className="text-xs text-[var(--text-faint)]">Next step</p>
        <p className="truncate text-sm font-bold text-[var(--text)]">{nextStep(ticket)}</p>
        {ticket.overdue ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-red-600 dark:text-red-400">
            <AlertCircle size={14} /> SLA breached
          </p>
        ) : (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
            <CalendarClock size={14} /> SLA in {humanizeDuration(dueMs)}
          </p>
        )}
      </div>

      <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-500/60 px-4 py-2 text-sm font-bold text-blue-600 dark:text-blue-300">
        {cta} <ArrowRight size={15} />
      </span>
    </Link>
  )
}

function CategoryIcon({ category }: { category?: string | null }) {
  const { Icon, badgeClass } = categoryVisual(category)
  return <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ${badgeClass}`}><Icon size={22} /></span>
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

function statusLabel(ticket: StoreManagerTicket): string {
  if (ticket.infoAdded) return 'Info added'
  if (ticket.status === 'info_requested') return 'Input needed'
  return PRIORITY_LEVEL_LABELS[ticket.priority] ?? (ticket.status === 'open' ? 'New' : ticket.status.replace(/_/g, ' '))
}

function statusPill(ticket: StoreManagerTicket): string {
  if (ticket.overdue || isUrgent(ticket)) return 'bg-red-500/15 text-red-600 dark:text-red-400'
  if (ticket.status === 'info_requested') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  if (ticket.status === 'in_progress') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
  if (ticket.status === 'scheduled') return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400'
  return 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
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
