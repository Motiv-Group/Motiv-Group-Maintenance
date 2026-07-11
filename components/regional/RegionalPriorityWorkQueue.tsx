'use client'

// Regional-manager equivalent of the store-manager Priority Work Queue: four
// filtering KPI cards (Open · Supplier Coming Today · Needs Your Input · In
// Progress) over the region's tickets, then an urgency-sorted queue. Same look /
// border effect as the SM cards; RM-appropriate statuses, next steps and links.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, AlertOctagon, AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, ClipboardList, ReceiptText, UserPlus } from 'lucide-react'
import type { RegionalTicketRow } from '@/lib/health/data'
import { Card } from '@/components/exec/ui'
import { CategoryIcon } from '@/components/client/ticketBadges'
import { AssignSuppliersButton, QuoteReviewButton, SignoffReviewButton } from '@/components/regional/RmTicketActions'
import { rmStatusMeta, formatDate, formatDateTime, humanizeDuration, PRIORITY_LEVEL_LABELS } from '@/lib/utils'

type QueueFilter = 'all' | 'assign' | 'quotes' | 'signoff' | 'sla' | 'snags'
type Tone = 'red' | 'purple' | 'gold' | 'green' | 'orange' | 'blue'
type SupplierChoice = { id: string; name: string; avgRating?: number; ratingCount?: number }

const URGENCY_RANK: Record<string, number> = { urgent: 0, P1: 0, high: 1, P2: 1, medium: 2, P3: 2, low: 3, P4: 3 }
const INACTIVE = new Set(['completed', 'cancelled', 'declined'])
const isActive = (s: string) => !INACTIVE.has(s)

// Each KPI card counts (and filters the queue to) one slice of the RM's work.
const QUOTE_STATUSES = new Set(['quoted', 'quote_revision'])                              // waiting on the RM to approve
// COC submitted & still in the sign-off pipeline (not completed) — every such
// ticket lands here EXCEPT active snags, which have their own KPI below.
const SIGNOFF_STATUSES = new Set(['submitted_for_signoff', 'evidence_requested', 'snag_resolved', 'approved_closeout', 'pending_sign_off'])
const SNAG_STATUSES = new Set(['snag', 'snag_assigned', 'snag_in_progress'])              // open snags
const needsAssignment = (t: RegionalTicketRow) => !t.supplierAssigned && (t.status === 'open' || t.status === 'info_requested')
const slaAtRisk = (t: RegionalTicketRow) => t.breached || t.overdue

export function RegionalPriorityWorkQueue({ tickets, generatedAt, suppliers = [], motivSuppliers = [] }: { tickets: RegionalTicketRow[]; generatedAt: string; suppliers?: SupplierChoice[]; motivSuppliers?: SupplierChoice[] }) {
  const [filter, setFilter] = useState<QueueFilter>('all')
  const nowMs = new Date(generatedAt).getTime()
  // Click the active card again to clear the filter.
  const pick = (k: QueueFilter) => setFilter(f => (f === k ? 'all' : k))

  const activeTickets = useMemo(() => tickets.filter(t => isActive(t.status)), [tickets])

  const counts = useMemo(() => ({
    assign: activeTickets.filter(needsAssignment).length,
    quotes: activeTickets.filter(t => QUOTE_STATUSES.has(t.status)).length,
    signoff: activeTickets.filter(t => SIGNOFF_STATUSES.has(t.status)).length,
    sla: activeTickets.filter(slaAtRisk).length,
    snags: activeTickets.filter(t => SNAG_STATUSES.has(t.status)).length,
  }), [activeTickets])

  const rows = useMemo(() =>
    activeTickets
      .filter(t => matchesFilter(t, filter))
      .sort((a, b) =>
        (URGENCY_RANK[String(a.priority)] ?? 9) - (URGENCY_RANK[String(b.priority)] ?? 9)
        || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [activeTickets, filter])

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricButton active={filter === 'assign'} icon={<UserPlus size={21} />} tone="blue" label="Needs Assignment"
          value={counts.assign} sub={counts.assign ? `${counts.assign} to assign` : 'All assigned'} subActive={counts.assign > 0} onClick={() => pick('assign')} />
        <MetricButton active={filter === 'quotes'} icon={<ReceiptText size={21} />} tone="purple" label="Quotes to Approve"
          value={counts.quotes} sub={counts.quotes ? `${counts.quotes} to review` : 'None to review'} subActive={counts.quotes > 0} onClick={() => pick('quotes')} />
        <MetricButton active={filter === 'signoff'} icon={<ClipboardCheck size={21} />} tone="orange" label="Awaiting Sign-off"
          value={counts.signoff} sub={counts.signoff ? `${counts.signoff} to sign off` : 'Nothing to sign off'} subActive={counts.signoff > 0} onClick={() => pick('signoff')} />
        <MetricButton active={filter === 'sla'} icon={<AlertTriangle size={21} />} tone="red" label="SLA at Risk"
          value={counts.sla} sub={counts.sla ? `${counts.sla} breaching` : 'On track'} subActive={counts.sla > 0} onClick={() => pick('sla')} />
        <MetricButton active={filter === 'snags'} icon={<AlertOctagon size={21} />} tone="gold" label="Snags Open"
          value={counts.snags} sub={counts.snags ? `${counts.snags} to resolve` : 'No open snags'} subActive={counts.snags > 0} onClick={() => pick('snags')} />
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
            {rows.length ? rows.map(t => <QueueRow key={t.id} ticket={t} nowMs={nowMs} suppliers={suppliers} motivSuppliers={motivSuppliers} />) : (
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

function MetricButton({ active, icon, label, value, sub, subActive, onClick }: {
  active: boolean; icon: React.ReactNode; tone?: Tone; label: string; value: number; sub: string; subActive: boolean; onClick: () => void
}) {
  const zero = value === 0
  // Icon chip, value, border and the (active) sub-line all share ONE state colour:
  // green when the count is 0 (all clear), amber when there's work outstanding.
  const stateText = zero ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
  const iconChip = zero ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/20'
  const stateBorder = zero ? 'border-2 border-emerald-500/60' : 'border-2 border-amber-500/70'

  return (
    <button type="button" onClick={onClick}
      className={`block rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${active ? 'ring-2 ring-blue-500/70' : ''}`}>
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

function QueueRow({ ticket, nowMs, suppliers, motivSuppliers }: { ticket: RegionalTicketRow; nowMs: number; suppliers: SupplierChoice[]; motivSuppliers: SupplierChoice[] }) {
  // The next SLA checkpoint (quote decision / sign-off / supplier action), falling
  // back to the final resolution deadline when there's no active blocker.
  const slaDeadline = ticket.slaDueAt ?? ticket.dueAt
  const slaMs = new Date(slaDeadline).getTime() - nowMs
  const breached = ticket.overdue || ticket.breached || slaMs <= 0
  const meta = rmStatusMeta(ticket.status)
  const ticketUrl = `/regional/tickets/${ticket.id}`
  // CTA per phase (all pop-ups open in place, like the SM "Add Info" button):
  //  · a quote is in to review        → "Approve quote"  (view + approve/decline)
  //  · a completion is in to sign off → "Sign off"       (view + approve/evidence/snag)
  //  · still gathering / awaiting quotes → "Assign supplier" (assign / add more)
  //  · anything else                   → "View Ticket"
  const reviewQuote = ['quoted', 'quote_revision'].includes(ticket.status)
  const reviewSignoff = ticket.status === 'submitted_for_signoff'
  const assignable = !reviewQuote && ['open', 'info_requested', 'suppliers_declined', 'assigned', 'quote_requested', 'assessment'].includes(ticket.status)
  // Same outline form-factor + size as the "View Ticket" button, so the queue's
  // CTAs are consistent. Sits above the whole-row link (z-20) so its click opens
  // the pop-up / navigates on its own.
  const ctaCls = 'relative z-20 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-blue-500/60 px-4 py-2 text-sm font-bold text-blue-600 transition hover:bg-blue-500/10 dark:text-blue-300 lg:w-40'
  return (
    <div className="relative grid gap-4 border-b border-[var(--border)] px-4 py-4 transition last:border-b-0 hover:bg-[var(--hover)] lg:grid-cols-[1fr_200px_1.1fr_160px] lg:items-center">
      {/* The whole row (except the CTA island) links to the ticket. */}
      <Link href={ticketUrl} aria-label={`View ${ticket.category || ticket.title} ticket`} className="absolute inset-0 z-10" />

      <div className="flex min-w-0 items-center gap-3">
        <CategoryIcon category={ticket.category ?? ticket.title} priority={ticket.priority} />
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-[var(--text)]">{ticket.category || ticket.title}</p>
          <p className="truncate text-sm text-[var(--text-muted)]">{ticket.storeName}</p>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${priorityBadgeClass(String(ticket.priority))}`}>{PRIORITY_LEVEL_LABELS[String(ticket.priority)] ?? 'Medium'}</span>
          <span className={`inline-flex w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
        </div>
        <p className="mt-1.5 truncate text-sm text-[var(--text-muted)]">{ticket.supplierAssigned ? 'Supplier assigned' : 'No supplier assigned'}</p>
      </div>

      <div className="min-w-0 border-l-0 border-[var(--border)] lg:border-l lg:pl-6">
        <p className="truncate text-xs text-[var(--text-faint)]">Next step · Logged {formatDate(ticket.createdAt)}</p>
        <p className="truncate text-sm font-bold text-[var(--text)]">{nextStep(ticket)}</p>
        {breached ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-red-600 dark:text-red-400"><AlertCircle size={14} /> SLA breached</p>
        ) : (
          <>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-muted)]"><CalendarClock size={14} /> SLA in {humanizeDuration(slaMs)}</p>
            <p className="truncate text-[11px] text-[var(--text-faint)]">Next deadline · {formatDateTime(slaDeadline)}</p>
          </>
        )}
      </div>

      <div className="flex lg:justify-end">
        {reviewQuote ? (
          <QuoteReviewButton ticketId={ticket.id}
            trigger={open => <button type="button" onClick={open} className={`${ctaCls} whitespace-nowrap`}>Approve quote</button>} />
        ) : reviewSignoff ? (
          <SignoffReviewButton ticketId={ticket.id}
            trigger={open => <button type="button" onClick={open} className={`${ctaCls} whitespace-nowrap`}><ClipboardCheck size={15} /> Sign-Off</button>} />
        ) : assignable ? (
          <AssignSuppliersButton ticketId={ticket.id} suppliers={suppliers} motivSuppliers={motivSuppliers}
            trigger={open => <button type="button" onClick={open} className={`${ctaCls} whitespace-nowrap`}>Assign supplier</button>} />
        ) : (
          <Link href={ticketUrl} className={ctaCls}>View Ticket <ArrowRight size={15} /></Link>
        )}
      </div>
    </div>
  )
}

function EmptyQueue({ filter }: { filter: QueueFilter }) {
  const copy = filter === 'assign' ? 'No tickets waiting for a supplier.'
    : filter === 'quotes' ? 'No quotes waiting for approval.'
    : filter === 'signoff' ? 'Nothing awaiting your sign-off.'
    : filter === 'sla' ? 'No tickets are breaching SLA.'
    : filter === 'snags' ? 'No open snags in your region.'
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

function matchesFilter(t: RegionalTicketRow, filter: QueueFilter): boolean {
  switch (filter) {
    case 'all': return true
    case 'assign': return needsAssignment(t)
    case 'quotes': return QUOTE_STATUSES.has(t.status)
    case 'signoff': return SIGNOFF_STATUSES.has(t.status)
    case 'sla': return slaAtRisk(t)
    case 'snags': return SNAG_STATUSES.has(t.status)
  }
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
