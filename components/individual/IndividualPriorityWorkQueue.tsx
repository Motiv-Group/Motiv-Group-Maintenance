'use client'

// Individual equivalent of the store-manager Priority Work Queue: filtering KPI
// cards (Open · Needs Your Action · Awaiting Supplier · In Progress) over the
// user's own jobs, then an urgency-sorted top-5 queue. Same look/behaviour as
// components/client/StorePriorityWorkQueue.tsx — but an Individual has no store /
// region / health score and plays BOTH the client and the manager side of their
// own job, so the per-row CTA deep-links to the job detail (where the shared
// RmTicketActions pop-ups live) rather than opening every action in place. The
// "Assign supplier" CTA deep-links with ?assign=1, which auto-opens the picker.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, CircleAlert, ClipboardList, Info, Loader2, MessageSquare, UserPlus } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { CategoryIcon } from '@/components/client/ticketBadges'
import { rmStatusMeta, formatDate, humanizeDuration, PRIORITY_LEVEL_LABELS } from '@/lib/utils'

export interface IndividualJobRow {
  id: string
  title: string
  category: string | null
  status: string
  priority: string
  createdAt: string
  supplierAssigned: boolean
  jobRef: string | null
  dueAt: string | null
  // A raised snag whose corrective visit the supplier has PROPOSED — the owner
  // must accept the time (detail page renders AcceptSnagScheduleCard). An owner
  // action, not passive waiting.
  snagAwaitingAccept: boolean
}

type QueueFilter = 'all' | 'open' | 'action' | 'awaiting' | 'progress'
type Tone = 'red' | 'orange' | 'purple' | 'gold'

const URGENCY_RANK: Record<string, number> = { urgent: 0, P1: 0, high: 1, P2: 1, medium: 2, P3: 2, low: 3, P4: 3 }
const TERMINAL = new Set(['completed', 'cancelled', 'declined'])
// The owner must act next (assign / approve a quote / sign off / close out / review VO).
// vo_declined = the owner declined the supplier's variation order and can now close
// out (detail page treats it identically to approved_closeout).
const ACTION_STATUSES = new Set(['quoted', 'quote_revision', 'submitted_for_signoff', 'pending_sign_off', 'snag_resolved', 'approved_closeout', 'vo_declined', 'variation_review'])
// Waiting on the supplier (quotes / scheduling / a snag being handled).
const AWAITING_STATUSES = new Set(['assigned', 'quote_requested', 'assessment', 'accepted', 'snag', 'snag_assigned', 'evidence_requested'])
// The supplier is actively on site / scheduled.
const PROGRESS_STATUSES = new Set(['in_progress', 'scheduled', 'snag_in_progress'])

const isActive = (t: IndividualJobRow) => !TERMINAL.has(t.status)
const needsAssign = (t: IndividualJobRow) => !t.supplierAssigned && ['open', 'info_requested', 'suppliers_declined'].includes(t.status)
const needsAction = (t: IndividualJobRow) => needsAssign(t) || t.snagAwaitingAccept || ACTION_STATUSES.has(t.status)
const isAwaiting = (t: IndividualJobRow) => !needsAction(t) && (AWAITING_STATUSES.has(t.status) || (t.status === 'open' && t.supplierAssigned))
const isProgress = (t: IndividualJobRow) => PROGRESS_STATUSES.has(t.status)
const isOverdue = (t: IndividualJobRow, nowMs: number) => !!t.dueAt && new Date(t.dueAt).getTime() < nowMs
const isUrgent = (t: IndividualJobRow, nowMs: number) => isOverdue(t, nowMs) || ['P1', 'urgent'].includes(t.priority)

// chatUnread: unread supplier-chat message counts by ticket id (server-computed;
// only awarded tickets have a chat) — rows with a count show a small blue chip.
export function IndividualPriorityWorkQueue({ jobs, generatedAt, chatUnread }: { jobs: IndividualJobRow[]; generatedAt: string; chatUnread?: Record<string, number> }) {
  const [filter, setFilter] = useState<QueueFilter>('all')
  const nowMs = new Date(generatedAt).getTime()
  const pick = (k: QueueFilter) => setFilter(f => (f === k ? 'all' : k))

  const active = useMemo(() => jobs.filter(isActive), [jobs])
  const counts = useMemo(() => ({
    open: active.length,
    action: active.filter(needsAction).length,
    awaiting: active.filter(isAwaiting).length,
    progress: active.filter(isProgress).length,
    urgent: active.filter(t => isUrgent(t, nowMs)).length,
  }), [active, nowMs])

  const rows = useMemo(() =>
    active
      .filter(t => matchesFilter(t, filter))
      .sort((a, b) =>
        (URGENCY_RANK[a.priority] ?? 9) - (URGENCY_RANK[b.priority] ?? 9)
        || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5),
    [active, filter])

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <MetricButton active={filter === 'open'} icon={<CircleAlert size={21} />} tone="red" label="Open Jobs"
          value={counts.open} sub={counts.urgent ? `${counts.urgent} urgent` : 'None urgent'} subActive={counts.urgent > 0} onClick={() => pick('open')} />
        <MetricButton active={filter === 'action'} icon={<Info size={21} />} tone="orange" label="Needs Your Action"
          value={counts.action} sub={counts.action ? `${counts.action} to act on` : 'Nothing to do'} subActive={counts.action > 0} onClick={() => pick('action')} />
        <MetricButton active={filter === 'awaiting'} icon={<UserPlus size={21} />} tone="purple" label="Awaiting Supplier"
          value={counts.awaiting} sub={counts.awaiting ? `${counts.awaiting} in progress` : 'None waiting'} subActive={counts.awaiting > 0} onClick={() => pick('awaiting')} />
        <MetricButton active={filter === 'progress'} icon={<Loader2 size={21} />} tone="gold" label="In Progress"
          value={counts.progress} sub={counts.progress ? 'Being worked on' : 'None active'} subActive={counts.progress > 0} onClick={() => pick('progress')} />
      </section>

      <Card className="overflow-hidden p-0">
        <div className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5 sm:py-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600/15 text-blue-600 dark:text-blue-300 sm:h-11 sm:w-11">
            <ClipboardList size={21} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-[var(--text)]">Priority Work Queue</h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Sorted by urgency, then most recent</p>
          </div>
        </div>

        <div className="px-4 py-4 sm:px-5">
          <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            {rows.length ? rows.map(t => <QueueRow key={t.id} job={t} nowMs={nowMs} unread={chatUnread?.[t.id] ?? 0} />) : (
              <div className="px-4 py-10"><EmptyQueue filter={filter} /></div>
            )}
            <div className="border-t border-[var(--border)] px-4 py-4">
              <Link href="/individual/tickets" className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:underline dark:text-blue-400">
                View all jobs <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

function MetricButton({ active, icon, label, value, sub, subActive, onClick }: {
  active: boolean; icon: React.ReactNode; tone?: Tone; label: string; value: number; sub: string; subActive: boolean; onClick: () => void
}) {
  const zero = value === 0
  const stateText = zero ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
  const iconChip = zero ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/20'
  const stateBorder = zero ? 'border-2 border-[var(--border)] dark:border-white/10' : 'border-2 border-amber-500/70'
  return (
    <button type="button" onClick={onClick}
      className={`block rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${active ? 'ring-2 ring-blue-500/70' : ''}`}>
      <Card className={`h-full p-3 transition hover:-translate-y-0.5 hover:ring-blue-500/30 sm:p-4 ${stateBorder} ${active ? 'ring-blue-500/60' : ''}`}>
        <div className="flex items-center gap-2.5 sm:gap-4">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1 sm:h-12 sm:w-12 ${iconChip}`}>{icon}</span>
          <div className="min-w-0">
            <p className="line-clamp-2 text-[11px] font-semibold text-[var(--text-muted)] sm:line-clamp-none sm:truncate sm:text-xs">{label}</p>
            <p className={`mt-0.5 text-xl font-bold leading-none sm:mt-1 sm:text-2xl ${stateText}`}>{value}</p>
            <p className={`mt-0.5 truncate text-[11px] font-semibold sm:mt-1 sm:text-xs ${subActive ? stateText : 'text-[var(--text-faint)]'}`}>{sub}</p>
          </div>
        </div>
      </Card>
    </button>
  )
}

function QueueRow({ job, nowMs, unread }: { job: IndividualJobRow; nowMs: number; unread: number }) {
  const overdue = isOverdue(job, nowMs)
  const dueMs = job.dueAt ? new Date(job.dueAt).getTime() - nowMs : null
  const ticketUrl = `/individual/tickets/${job.id}`
  const meta = rmStatusMeta(job.status)
  const cta = ctaFor(job)
  const critical = ['P1', 'urgent'].includes(job.priority)
  const ctaCls = `relative z-20 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition lg:w-40 ${critical ? 'border-red-500/60 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-300' : 'border-blue-500/60 text-blue-600 hover:bg-blue-500/10 dark:text-blue-300'}`

  return (
    <div className="relative grid gap-3 border-b border-[var(--border)] px-4 py-3 transition last:border-b-0 hover:bg-[var(--hover)] sm:gap-4 sm:py-4 lg:grid-cols-[1fr_200px_1.1fr_160px] lg:items-center">
      <Link href={ticketUrl} aria-label={`View ${job.category || job.title} job`} className="absolute inset-0 z-10" />

      <div className="flex min-w-0 items-center gap-3">
        <CategoryIcon category={job.category ?? job.title} priority={job.priority} />
        <div className="min-w-0">
          {job.jobRef && <p className="truncate font-mono text-[10px] text-[var(--text-faint)]">{job.jobRef}</p>}
          <p className="line-clamp-2 text-base font-bold text-[var(--text)] sm:line-clamp-none sm:truncate">{job.category || job.title}</p>
          {job.category && <p className="line-clamp-2 text-sm text-[var(--text-muted)] sm:line-clamp-none sm:truncate">{job.title}</p>}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex w-[72px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${priorityBadgeClass(job.priority)}`}>{PRIORITY_LEVEL_LABELS[job.priority] ?? 'Medium'}</span>
          <span className={`inline-flex w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
          {unread > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400"><MessageSquare size={11} /> {unread}</span>
          )}
        </div>
        <p className="mt-1.5 truncate text-sm text-[var(--text-muted)]">{job.supplierAssigned ? 'Supplier assigned' : 'No supplier assigned'}</p>
      </div>

      <div className="min-w-0 border-l-0 border-[var(--border)] lg:border-l lg:pl-6">
        <p className="truncate text-xs text-[var(--text-muted)]">Next step · Logged {formatDate(job.createdAt)}</p>
        <p className="truncate text-sm font-bold text-[var(--text)]">{nextStep(job)}</p>
        {overdue ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-red-600 dark:text-red-400"><AlertCircle size={14} /> Overdue</p>
        ) : dueMs != null ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-muted)]"><CalendarClock size={14} /> Due in {humanizeDuration(dueMs)}</p>
        ) : null}
      </div>

      <div className="flex lg:justify-end">
        <Link href={cta.href} className={`${ctaCls} whitespace-nowrap`}>{cta.label} <ArrowRight size={15} /></Link>
      </div>
    </div>
  )
}

function ctaFor(t: IndividualJobRow): { label: string; href: string } {
  const base = `/individual/tickets/${t.id}`
  if (needsAssign(t)) return { label: 'Assign Supplier', href: `${base}?assign=1` }
  if (t.snagAwaitingAccept) return { label: 'Accept Schedule', href: base }
  if (['quoted', 'quote_revision'].includes(t.status)) return { label: 'Review Quote', href: base }
  if (['submitted_for_signoff', 'pending_sign_off', 'snag_resolved'].includes(t.status)) return { label: 'Review Sign-Off', href: base }
  if (['approved_closeout', 'vo_declined'].includes(t.status)) return { label: 'Close Out', href: base }
  if (t.status === 'variation_review') return { label: 'Review VO', href: base }
  return { label: 'View Job', href: base }
}

function nextStep(t: IndividualJobRow): string {
  if (needsAssign(t)) return 'Assign a supplier to get quotes'
  if (t.snagAwaitingAccept) return 'Accept the proposed snag schedule'
  switch (t.status) {
    case 'open':
    case 'assigned':
    case 'quote_requested':
    case 'assessment': return 'Waiting for supplier quotes'
    case 'quoted':
    case 'quote_revision': return 'Review & approve a quote'
    case 'accepted': return 'Approved — awaiting scheduling'
    case 'scheduled': return 'Supplier visit is scheduled'
    case 'in_progress': return 'Supplier is working on the job'
    case 'submitted_for_signoff':
    case 'pending_sign_off': return 'Review & sign off the work'
    case 'snag_resolved': return 'Review the resolved snag'
    case 'evidence_requested': return 'Awaiting evidence from the supplier'
    case 'snag':
    case 'snag_assigned': return 'Snag is being scheduled'
    case 'snag_in_progress': return 'Snag in progress'
    case 'approved_closeout':
    case 'vo_declined': return 'Finalise the close-out'
    case 'variation_review': return 'Review the variation order'
    default: return 'Track progress on the job'
  }
}

function priorityBadgeClass(p: string): string {
  if (p === 'urgent' || p === 'P1') return 'bg-red-500/15 text-red-600 dark:text-red-400'
  if (p === 'high' || p === 'P2') return 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
  if (p === 'medium' || p === 'P3') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  return 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
}

function matchesFilter(t: IndividualJobRow, filter: QueueFilter): boolean {
  switch (filter) {
    case 'all':
    case 'open': return true
    case 'action': return needsAction(t)
    case 'awaiting': return isAwaiting(t)
    case 'progress': return isProgress(t)
  }
}

function EmptyQueue({ filter }: { filter: QueueFilter }) {
  const copy = filter === 'action' ? 'Nothing waiting on you.'
    : filter === 'awaiting' ? 'No jobs waiting on a supplier.'
    : filter === 'progress' ? 'No jobs are in progress.'
    : 'No active jobs — log one to get started.'
  return (
    <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center">
      <div>
        <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-faint)]"><CheckCircle2 size={24} /></div>
        <p className="text-sm font-semibold text-[var(--text-muted)]">{copy}</p>
      </div>
    </div>
  )
}
