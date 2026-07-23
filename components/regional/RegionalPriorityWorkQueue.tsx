'use client'

// Regional-manager equivalent of the store-manager Priority Work Queue: four
// filtering KPI cards (Open · Supplier Coming Today · Needs Your Input · In
// Progress) over the region's tickets, then an urgency-sorted queue. Same look /
// border effect as the SM cards (shared internals in components/workqueue/shared.tsx);
// RM-appropriate statuses, next steps and links.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertOctagon, AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, MessageSquare, ReceiptText, UserPlus, XCircle } from 'lucide-react'
import type { RegionalTicketRow } from '@/lib/health/data'
import { Modal } from '@/components/ui/Modal'
import { ViewAssignButton, QuoteReviewButton, SignoffReviewButton, VariationReviewButton } from '@/components/regional/RmTicketActions'
import { DisputeReviewButton } from '@/components/dispute/DisputeBox'
import { TicketChat } from '@/components/chat/TicketChat'
import { MoreMenu, MoreActionItem, SupplierRatingCard } from '@/components/regional/rm-actions/ticket'
import { post, errMsg } from '@/components/regional/rm-actions/shared'
import { rmStatusMeta, formatJobId, formatDateTime } from '@/lib/utils'
import {
  byUrgencyThenNewest, EmptyQueue, isActive, isCriticalPriority, MetricButton,
  QueueCard, queueCtaClass, QueueRowBadges, QueueRowNextStep, QueueRowShell, QueueRowTitle,
} from '@/components/workqueue/shared'

type QueueFilter = 'all' | 'assign' | 'quotes' | 'signoff' | 'sla' | 'snags'
type SupplierChoice = { id: string; name: string; avgRating?: number; ratingCount?: number; category?: string | null }

// Each KPI card counts (and filters the queue to) one slice of the RM's work.
const QUOTE_STATUSES = new Set(['quoted', 'quote_revision', 'variation_review'])          // waiting on the RM to approve (incl. VOs)
// COC submitted & still in the sign-off pipeline (not completed) — every such
// ticket lands here EXCEPT active snags, which have their own KPI below.
const SIGNOFF_STATUSES = new Set(['submitted_for_signoff', 'evidence_requested', 'snag_resolved', 'approved_closeout', 'pending_sign_off'])
const SNAG_STATUSES = new Set(['snag', 'snag_assigned', 'snag_in_progress'])              // open snags
const needsAssignment = (t: RegionalTicketRow) => !t.supplierAssigned && (t.status === 'open' || t.status === 'info_requested')
const slaAtRisk = (t: RegionalTicketRow) => t.breached || t.overdue

export function RegionalPriorityWorkQueue({ tickets, generatedAt, suppliers = [], motivSuppliers = [], motivAccess = 'none', chatUnread = {} }: { tickets: RegionalTicketRow[]; generatedAt: string; suppliers?: SupplierChoice[]; motivSuppliers?: SupplierChoice[]; motivAccess?: 'none' | 'pending' | 'approved' | 'rejected'; chatUnread?: Record<string, number> }) {
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
      .sort(byUrgencyThenNewest)
      // Cap the queue at the top 5 — the rest live behind "View all tickets".
      .slice(0, 5),
    [activeTickets, filter])

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-5 max-sm:[&>*:nth-child(5)]:col-span-2">
        <MetricButton compact active={filter === 'assign'} icon={<UserPlus size={21} />} tone="blue" label="Needs Assignment"
          value={counts.assign} sub={counts.assign ? `${counts.assign} to assign` : 'All assigned'} subActive={counts.assign > 0} onClick={() => pick('assign')} />
        <MetricButton compact active={filter === 'quotes'} icon={<ReceiptText size={21} />} tone="purple" label="Quotes to Approve"
          value={counts.quotes} sub={counts.quotes ? `${counts.quotes} to review` : 'None to review'} subActive={counts.quotes > 0} onClick={() => pick('quotes')} />
        <MetricButton compact active={filter === 'signoff'} icon={<ClipboardCheck size={21} />} tone="orange" label="Awaiting Sign-off"
          value={counts.signoff} sub={counts.signoff ? `${counts.signoff} to sign off` : 'Nothing to sign off'} subActive={counts.signoff > 0} onClick={() => pick('signoff')} />
        <MetricButton compact active={filter === 'sla'} icon={<AlertTriangle size={21} />} tone="red" label="SLA at Risk"
          value={counts.sla} sub={counts.sla ? `${counts.sla} breaching` : 'On track'} subActive={counts.sla > 0} onClick={() => pick('sla')} />
        <MetricButton compact active={filter === 'snags'} icon={<AlertOctagon size={21} />} tone="gold" label="Snags Open"
          value={counts.snags} sub={counts.snags ? `${counts.snags} to resolve` : 'No open snags'} subActive={counts.snags > 0} onClick={() => pick('snags')} />
      </section>

      <QueueCard compact viewAllHref="/regional/tickets">
        {rows.length ? rows.map(t => <QueueRow key={t.id} ticket={t} nowMs={nowMs} suppliers={suppliers} motivSuppliers={motivSuppliers} motivAccess={motivAccess} chatUnread={chatUnread[t.id] ?? 0} />) : (
          <div className="px-4 py-10"><EmptyQueue copy={emptyCopy(filter)} /></div>
        )}
      </QueueCard>
    </div>
  )
}

function emptyCopy(filter: QueueFilter): string {
  return filter === 'assign' ? 'No tickets waiting for a supplier.'
    : filter === 'quotes' ? 'No quotes waiting for approval.'
    : filter === 'signoff' ? 'Nothing awaiting your sign-off.'
    : filter === 'sla' ? 'No tickets are breaching SLA.'
    : filter === 'snags' ? 'No open snags in your region.'
    : 'No active tickets in your region.'
}

function QueueRow({ ticket, nowMs, suppliers, motivSuppliers, motivAccess, chatUnread }: { ticket: RegionalTicketRow; nowMs: number; suppliers: SupplierChoice[]; motivSuppliers: SupplierChoice[]; motivAccess: 'none' | 'pending' | 'approved' | 'rejected'; chatUnread: number }) {
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
  //  · a snag-fix time is proposed    → "View Schedule"  (approve / decline / chat)
  //  · still gathering / awaiting quotes → "Assign supplier" (assign / add more)
  //  · anything else                   → "View Ticket"
  const reviewQuote = ['quoted', 'quote_revision'].includes(ticket.status)
  const reviewVo = ticket.status === 'variation_review'
  const reviewSignoff = ticket.status === 'submitted_for_signoff'
  // The supplier proposed a snag-fix time that the RM still needs to approve.
  const proposedSnagAt = ticket.status === 'snag_assigned' && ticket.snagScheduleStatus === 'proposed' ? ticket.snagScheduledAt : null
  const assignable = !reviewQuote && ['open', 'info_requested', 'suppliers_declined', 'assigned', 'quote_requested', 'assessment'].includes(ticket.status)
  const ctaCls = queueCtaClass(isCriticalPriority(ticket.priority))
  // Close-out: the status badge is blue while awaiting the supplier's "no further
  // VOs" confirmation and amber once confirmed; the close-out button is disabled
  // until then (the RM can only finalise after the supplier confirms).
  const closeout = ticket.status === 'approved_closeout'
  const closeoutBadge = ticket.voNoneConfirmed ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
  const jobId = ticket.jobRef ?? formatJobId(ticket.jobNumber)
  return (
    <QueueRowShell compact href={ticketUrl} ariaLabel={`View ${ticket.category || ticket.title} ticket`}>
      <QueueRowTitle category={ticket.category} title={ticket.title} priority={String(ticket.priority)} jobId={jobId} subtitle={ticket.storeName} />

      <QueueRowBadges priority={String(ticket.priority)}
        statusCls={ticket.disputed ? 'bg-violet-500/15 text-violet-700 dark:text-violet-400' : closeout ? closeoutBadge : meta.cls}
        statusLabel={ticket.disputed ? 'Dispute' : closeout ? 'Close-out' : meta.label}
        disputeUnread={ticket.disputeUnread} chatUnread={chatUnread} note={ticket.supplierAssigned ? 'Supplier assigned' : 'No supplier assigned'} />

      <QueueRowNextStep createdAt={ticket.createdAt} nextStep={nextStep(ticket)} breached={breached} slaMs={slaMs} slaDeadline={slaDeadline} deadlineHiddenOnMobile />

      <div className="flex lg:justify-end">
        {ticket.disputed ? (
          <DisputeReviewButton ticketId={ticket.id} viewerRole="regional_manager"
            trigger={open => <button type="button" onClick={open} className={`${ctaCls} whitespace-nowrap`}>View Dispute</button>} />
        ) : reviewQuote ? (
          <QuoteReviewButton ticketId={ticket.id}
            trigger={open => <button type="button" onClick={open} className={`${ctaCls} whitespace-nowrap`}>Approve Quote</button>} />
        ) : reviewVo ? (
          <VariationReviewButton ticketId={ticket.id}
            trigger={open => <button type="button" onClick={open} className={`${ctaCls} whitespace-nowrap`}>View &amp; Approve</button>} />
        ) : reviewSignoff ? (
          <SignoffReviewButton ticketId={ticket.id}
            trigger={open => <button type="button" onClick={open} className={`${ctaCls} whitespace-nowrap`}><ClipboardCheck size={15} /> Sign-Off</button>} />
        ) : proposedSnagAt ? (
          <SnagScheduleReview ticketId={ticket.id} scheduledAt={proposedSnagAt} snagDescription={ticket.snagDescription} className={`${ctaCls} whitespace-nowrap`} />
        ) : assignable ? (
          <ViewAssignButton ticketId={ticket.id} suppliers={suppliers} motivSuppliers={motivSuppliers} motivAccess={motivAccess}
            awaitingById={ticket.engagedSupplierIds} declinedSupplierIds={ticket.declinedSupplierIds}
            summary={{ category: ticket.category, title: ticket.title, storeName: ticket.storeName, status: ticket.status, priority: String(ticket.priority), jobId }}
            trigger={open => <button type="button" onClick={open} className={`${ctaCls} whitespace-nowrap`}>View &amp; Assign</button>} />
        ) : closeout ? (
          ticket.voNoneConfirmed
            ? <CloseOutConfirm ticketId={ticket.id} storeName={ticket.storeName} category={ticket.category || ticket.title} className={ctaCls} />
            : <span className={`${ctaCls} opacity-50 pointer-events-none`} aria-disabled="true">Close-Out</span>
        ) : (
          <Link href={ticketUrl} className={ctaCls}>View Ticket <ArrowRight size={15} /></Link>
        )}
      </div>
    </QueueRowShell>
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

// "Close-out" (once the supplier has confirmed no VOs) opens a confirmation
// pop-up before completing the ticket — the close-out is final. Mirrors the
// ticket page's CloseOutButton: a REQUIRED 1–5 star supplier rating + optional
// comment, posted to /api/ratings before the close_out transition.
function CloseOutConfirm({ ticketId, storeName, category, className }: { ticketId: string; storeName: string; category: string; className: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function confirm() {
    if (!score) { setErr('Please give the supplier a star rating before closing out.'); return }
    setBusy(true); setErr('')
    try {
      await post(`/api/ratings`, { ticketId, score, comment })
      await post(`/api/tickets/${ticketId}/transition`, { action: 'close_out' })
      setOpen(false); router.refresh()
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>Close-Out <ArrowRight size={15} /></button>
      {open && (
        <Modal onClose={() => { if (!busy) { setOpen(false); setErr('') } }} maxWidth="max-w-lg">
          {close => (
            <div className="space-y-5">
              <div className="flex flex-col items-center text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={30} /></span>
                <h3 className="mt-3 text-xl font-bold text-[var(--text)]">Complete this ticket?</h3>
                <p className="mt-1.5 text-sm text-[var(--text-muted)]">This finalises the close-out and marks <span className="font-semibold text-[var(--text)]">{category}</span> at <span className="font-semibold text-[var(--text)]">{storeName}</span> as <span className="font-semibold text-emerald-600 dark:text-emerald-400">Completed</span>. This can&apos;t be undone.</p>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl bg-emerald-500/10 px-3.5 py-3 ring-1 ring-emerald-500/25">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm text-[var(--text-muted)]">The supplier confirmed there are no further variation orders, so the job is ready to be closed out and completed.</p>
              </div>
              <SupplierRatingCard score={score} comment={comment} onScore={v => { setScore(v); setErr('') }} onComment={setComment} />
              {err && <p className="text-sm text-red-500">{err}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={close} disabled={busy} className="flex-1 rounded-xl py-2.5 text-sm font-medium text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-50">Cancel</button>
                <button type="button" onClick={confirm} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"><CheckCircle2 size={16} /> {busy ? 'Completing…' : 'Complete ticket'}</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

// "View Schedule" (snag assigned + a supplier-proposed fix time) opens the
// proposed snag schedule for review: approve it, decline it with a reason (the
// supplier is asked to propose a new time), or chat with the supplier. The
// queue equivalent of the ticket page's AcceptSnagScheduleCard.
function SnagScheduleReview({ ticketId, scheduledAt, snagDescription, className }: { ticketId: string; scheduledAt: string; snagDescription: string | null; className: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [declining, setDeclining] = useState(false)  // swaps the pop-up body to the decline step
  const [chat, setChat] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function act(body: { action: 'approve_snag' } | { action: 'decline_snag_schedule'; reason?: string }, fail: string) {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/tickets/${ticketId}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? fail)
      setOpen(false); router.refresh()
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>View Schedule <ArrowRight size={15} /></button>
      {open && (
        <Modal onClose={() => { if (!busy) { setOpen(false); setDeclining(false); setErr('') } }} maxWidth="max-w-lg">
          {() => declining ? (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-[var(--text)]">Decline the proposed time</h3>
              <p className="text-sm text-[var(--text-muted)]">The supplier is notified and asked to propose a new time for the corrective work.</p>
              <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Tell the supplier why the proposed time doesn't work…"
                className="min-h-[100px] w-full rounded-xl bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text)] ring-1 ring-[var(--border)] placeholder-[var(--text-faint)]" />
              {err && <p className="text-sm text-red-500">{err}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setDeclining(false); setErr('') }} disabled={busy} className="flex-1 rounded-xl py-2.5 text-sm font-medium text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-50">Back</button>
                <button type="button" onClick={() => act({ action: 'decline_snag_schedule', reason: reason.trim() || undefined }, 'Failed to decline the proposed time.')} disabled={busy}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"><XCircle size={16} /> {busy ? 'Declining…' : 'Decline schedule'}</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-[var(--text)]">Proposed snag schedule</h3>
              {snagDescription && <p className="text-sm text-[var(--text-muted)]">{snagDescription}</p>}
              <div className="flex items-center gap-2.5 rounded-xl bg-indigo-500/5 px-3.5 py-3 ring-1 ring-indigo-500/40">
                <CalendarClock size={16} className="shrink-0 text-indigo-500" />
                <p className="text-sm text-[var(--text-muted)]">Proposed time: <span className="font-bold text-[var(--text)]">{formatDateTime(scheduledAt)}</span></p>
              </div>
              {err && <p className="text-sm text-red-500">{err}</p>}
              {/* More on the LEFT, Approve primary on the RIGHT. `inline up align="left"`
                  keeps the dropdown INSIDE the pop-up: left-aligned + w-56 clears the
                  375px modal width, and opening up (footer is the modal's last row)
                  keeps the panel over the content above rather than past the bottom. */}
              <div className="flex items-center gap-2">
                <MoreMenu inline up align="left">
                  <MoreActionItem icon={<MessageSquare size={16} />} label="Chat with the supplier" onClick={() => setChat(true)} />
                  <MoreActionItem icon={<XCircle size={16} />} label="Decline the proposed time" tone="danger" onClick={() => { setErr(''); setDeclining(true) }} />
                </MoreMenu>
                <button type="button" onClick={() => act({ action: 'approve_snag' }, 'Failed to approve the snag schedule.')} disabled={busy}
                  className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"><CheckCircle2 size={16} /> {busy ? 'Approving…' : 'Approve schedule'}</button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {/* Chat stacks over the pop-up as a sibling — a snag means the supplier is already awarded. */}
      {chat && <TicketChat ticketId={ticketId} viewerRole="regional_manager" defaultOpen onClose={() => setChat(false)} />}
    </>
  )
}

// The RM's next step per ticket status — short, professional, and covering every
// state (no generic fallback for a real status). Mirrors the ticket-detail
// "Next action" wording so the queue and the ticket page always agree.
function nextStep(t: RegionalTicketRow): string {
  if (t.disputed) return 'Resolve the open dispute'
  switch (t.status) {
    case 'open': return t.infoAdded ? 'Review the added information' : t.supplierAssigned ? 'Awaiting quotes from suppliers' : 'Assign a supplier to request quotes'
    case 'info_requested': return t.infoAdded ? 'Review the added information' : "Awaiting the store's response"
    case 'suppliers_declined': return 'Re-assign a supplier'
    case 'assigned':
    case 'quote_requested':
    case 'assessment': return 'Awaiting quotes from suppliers'
    case 'quoted':
    case 'quote_revision': return 'Review & approve the quote'
    case 'variation_review': return 'Review the variation order'
    case 'accepted': return 'Approved — awaiting scheduling'
    case 'scheduled': return 'Supplier visit scheduled'
    case 'in_progress': return 'Supplier is working on this ticket'
    // A withdrawn dispute drops the snag — the submission is back under review.
    case 'submitted_for_signoff': return t.lastDisputeOutcome === 'withdrawn' ? 'Snag dropped — review & sign off the work' : 'Review & sign off the work'
    case 'pending_sign_off':
    case 'snag_resolved': return 'Review & sign off the work'
    case 'evidence_requested': return 'Awaiting evidence from the supplier'
    // Snags: an upheld dispute waits on the supplier's schedule; a declined
    // proposal waits on the supplier's new time; a 'proposed' one waits on the
    // RM's approval; otherwise the corrective work is underway.
    case 'snag': return t.lastDisputeOutcome === 'upheld' ? "Snag upheld — awaiting the supplier's schedule"
      : t.snagScheduleStatus === 'declined' ? 'Awaiting a new proposed time from the supplier' : "Snagged — awaiting the supplier's response"
    case 'snag_assigned': return t.snagScheduleStatus === 'proposed' ? 'Approve the snag schedule time' : 'Snag scheduled — awaiting the corrective work'
    case 'snag_in_progress': return 'Corrective work in progress'
    case 'approved_closeout': return t.voNoneConfirmed ? 'Finalise the close-out' : 'Awaiting the supplier to confirm variation orders'
    case 'completed': return 'Completed'
    case 'cancelled':
    case 'declined': return 'Closed'
    default: return 'Track progress on this ticket'
  }
}
