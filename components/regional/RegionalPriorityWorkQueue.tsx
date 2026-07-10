'use client'

// Regional-manager equivalent of the store-manager Priority Work Queue: four
// filtering KPI cards (Open · Supplier Coming Today · Needs Your Input · In
// Progress) over the region's tickets, then an urgency-sorted queue. Same look /
// border effect as the SM cards; RM-appropriate statuses, next steps and links.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, CircleAlert, ClipboardList, Info, Loader2 } from 'lucide-react'
import type { RegionalTicketRow } from '@/lib/health/data'
import { Card } from '@/components/exec/ui'
import { CategoryIcon } from '@/components/client/ticketBadges'
import { rmStatusMeta, formatDate, humanizeDuration, PRIORITY_LEVEL_LABELS } from '@/lib/utils'

type QueueFilter = 'all' | 'open' | 'today' | 'input' | 'progress'
type Tone = 'red' | 'purple' | 'gold' | 'green' | 'orange'

const URGENCY_RANK: Record<string, number> = { urgent: 0, P1: 0, high: 1, P2: 1, medium: 2, P3: 2, low: 3, P4: 3 }
const INACTIVE = new Set(['completed', 'cancelled', 'declined'])
const isActive = (s: string) => !INACTIVE.has(s)
// "Needs your input" = the RM's decision queue: quotes to approve, variation
// orders to review, and completed work awaiting sign-off.
const INPUT_STATUSES = new Set(['quoted', 'quote_revision', 'variation_review', 'submitted_for_signoff', 'snag_resolved', 'approved_closeout'])

const saDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

export function RegionalPriorityWorkQueue({ tickets, generatedAt }: { tickets: RegionalTicketRow[]; generatedAt: string }) {
  const [filter, setFilter] = useState<QueueFilter>('all')
  const nowMs = new Date(generatedAt).getTime()
  const genDay = saDay(generatedAt)

  const activeTickets = useMemo(() => tickets.filter(t => isActive(t.status)), [tickets])
  const todayIds = useMemo(
    () => new Set(activeTickets.filter(t => t.scheduledAt && saDay(t.scheduledAt) === genDay).map(t => t.id)),
    [activeTickets, genDay],
  )

  const counts = useMemo(() => ({
    open: activeTickets.length,
    today: todayIds.size,
    input: activeTickets.filter(t => INPUT_STATUSES.has(t.status)).length,
    progress: activeTickets.filter(t => t.status === 'in_progress').length,
    urgent: activeTickets.filter(t => isUrgent(t)).length,
  }), [activeTickets, todayIds])

  const rows = useMemo(() =>
    activeTickets
      .filter(t => matchesFilter(t, filter, todayIds))
      .sort((a, b) =>
        (URGENCY_RANK[String(a.priority)] ?? 9) - (URGENCY_RANK[String(b.priority)] ?? 9)
        || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [activeTickets, filter, todayIds])

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricButton active={filter === 'open'} icon={<CircleAlert size={21} />} tone="red" label="Open Tickets"
          value={counts.open} sub={`${counts.urgent} urgent`} subActive={counts.urgent > 0} onClick={() => setFilter('open')} />
        <MetricButton active={filter === 'today'} icon={<CalendarClock size={21} />} tone="purple" label="Supplier Coming Today"
          value={counts.today} sub={counts.today ? `${counts.today} visit${counts.today === 1 ? '' : 's'} booked` : 'No visits booked'} subActive={counts.today > 0} onClick={() => setFilter('today')} />
        <MetricButton active={filter === 'input'} icon={<Info size={21} />} tone="orange" label="Needs Your Input"
          value={counts.input} sub={counts.input ? `${counts.input} to action` : 'Nothing to action'} subActive={counts.input > 0} onClick={() => setFilter('input')} />
        <MetricButton active={filter === 'progress'} icon={<Loader2 size={21} />} tone="gold" label="In Progress"
          value={counts.progress} sub="Being worked on" subActive={counts.progress > 0} onClick={() => setFilter('progress')} />
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
            {rows.length ? rows.map(t => <QueueRow key={t.id} ticket={t} nowMs={nowMs} />) : (
              <div className="px-4 py-10"><EmptyQueue filter={filter} /></div>
            )}
            <div className="border-t border-[var(--border)] px-4 py-4">
              <Link href="/regional/tickets" className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:underline dark:text-blue-400">
                View all tickets <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

function MetricButton({ active, icon, tone, label, value, sub, subActive, onClick }: {
  active: boolean; icon: React.ReactNode; tone: Tone; label: string; value: number; sub: string; subActive: boolean; onClick: () => void
}) {
  const tones: Record<Tone, string> = {
    red: 'bg-red-500/15 text-red-600 dark:text-red-300 ring-red-500/20',
    purple: 'bg-purple-500/15 text-purple-600 dark:text-purple-300 ring-purple-500/20',
    gold: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D] ring-[#C6A35D]/20',
    green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20',
    orange: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 ring-orange-500/20',
  }
  const subTone: Record<Tone, string> = {
    red: 'text-red-600 dark:text-red-400',
    gold: 'text-amber-600 dark:text-[#C6A35D]',
    green: 'text-emerald-600 dark:text-emerald-400',
    purple: 'text-purple-600 dark:text-purple-300',
    orange: 'text-orange-600 dark:text-orange-400',
  }
  const subColor = subActive ? subTone[tone] : 'text-[var(--text-faint)]'
  const zero = value === 0
  const valueColor = zero ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
  const stateBorder = zero ? 'border-2 border-emerald-500/60' : 'border-2 border-amber-500/70'

  return (
    <button type="button" onClick={onClick}
      className={`block rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${active ? 'ring-2 ring-blue-500/70' : ''}`}>
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

function QueueRow({ ticket, nowMs }: { ticket: RegionalTicketRow; nowMs: number }) {
  const dueMs = Math.max(0, new Date(ticket.dueAt).getTime() - nowMs)
  const meta = rmStatusMeta(ticket.status)
  return (
    <Link href={`/regional/tickets/${ticket.id}`} className="grid gap-4 border-b border-[var(--border)] px-4 py-4 transition last:border-b-0 hover:bg-[var(--hover)] lg:grid-cols-[1fr_200px_1.1fr_160px] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <CategoryIcon category={ticket.category ?? ticket.title} />
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-[var(--text)]">{ticket.category || ticket.title}</p>
          <p className="truncate text-sm text-[var(--text-muted)]">{ticket.storeName}</p>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex min-w-[68px] justify-center rounded-md px-2 py-1 text-[10px] font-bold ${priorityBadgeClass(String(ticket.priority))}`}>{PRIORITY_LEVEL_LABELS[String(ticket.priority)] ?? 'Medium'}</span>
          <span className={`inline-flex min-w-[68px] justify-center rounded-md px-2 py-1 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
        </div>
        <p className="mt-1.5 truncate text-sm text-[var(--text-muted)]">{ticket.supplierAssigned ? 'Supplier assigned' : 'No supplier assigned'}</p>
      </div>

      <div className="min-w-0 border-l-0 border-[var(--border)] lg:border-l lg:pl-6">
        <p className="truncate text-xs text-[var(--text-faint)]">Next step · Logged {formatDate(ticket.createdAt)}</p>
        <p className="truncate text-sm font-bold text-[var(--text)]">{nextStep(ticket)}</p>
        {ticket.overdue ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-red-600 dark:text-red-400"><AlertCircle size={14} /> SLA breached</p>
        ) : (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-muted)]"><CalendarClock size={14} /> Due in {humanizeDuration(dueMs)}</p>
        )}
      </div>

      <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-500/60 px-4 py-2 text-sm font-bold text-blue-600 dark:text-blue-300">
        View Ticket <ArrowRight size={15} />
      </span>
    </Link>
  )
}

function EmptyQueue({ filter }: { filter: QueueFilter }) {
  const copy = filter === 'today' ? 'No supplier visits booked for today.'
    : filter === 'input' ? 'Nothing waiting on your decision.'
    : filter === 'progress' ? 'No tickets are in progress.'
    : 'No active tickets in your region.'
  return (
    <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center">
      <div>
        <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-faint)]"><CheckCircle2 size={24} /></div>
        <p className="text-sm font-semibold text-[var(--text-muted)]">{copy}</p>
      </div>
    </div>
  )
}

function matchesFilter(t: RegionalTicketRow, filter: QueueFilter, todayIds: Set<string>): boolean {
  switch (filter) {
    case 'all':
    case 'open': return true
    case 'today': return todayIds.has(t.id)
    case 'input': return INPUT_STATUSES.has(t.status)
    case 'progress': return t.status === 'in_progress'
  }
}

function isUrgent(t: RegionalTicketRow): boolean {
  const p = String(t.priority)
  return t.overdue || p === 'urgent' || p === 'P1'
}

function priorityBadgeClass(p: string): string {
  if (p === 'urgent' || p === 'P1') return 'bg-red-500/15 text-red-600 dark:text-red-400'
  if (p === 'high' || p === 'P2') return 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
  if (p === 'medium' || p === 'P3') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  return 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
}

function nextStep(t: RegionalTicketRow): string {
  const s = t.status
  if (!t.supplierAssigned && (s === 'open' || s === 'info_requested')) return 'Assign a supplier / request a quote'
  if (s === 'info_requested') return 'Waiting on the store for more info'
  if (s === 'quoted' || s === 'quote_revision') return 'Review & approve the quote'
  if (s === 'variation_review') return 'Review the variation order'
  if (s === 'accepted') return 'Approved — awaiting scheduling'
  if (s === 'scheduled' || s === 'snag_assigned') return 'Supplier visit is scheduled'
  if (s === 'in_progress' || s === 'snag_in_progress') return 'Supplier is working on this ticket'
  if (['submitted_for_signoff', 'snag_resolved', 'approved_closeout', 'evidence_requested'].includes(s)) return 'Review & sign off the completed work'
  if (s === 'snag') return 'Snag raised — awaiting supplier'
  return 'Track progress on this ticket'
}
