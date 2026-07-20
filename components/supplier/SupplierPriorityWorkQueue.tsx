'use client'

// Supplier equivalent of the SM/RM Priority Work Queue: filtering KPI cards over
// the supplier's active jobs, then an urgency-sorted queue with a phase-aware CTA
// per row. Same look/behaviour as components/regional/RegionalPriorityWorkQueue.tsx
// (shared internals in components/workqueue/shared.tsx), with supplier lifecycle
// phases (submit quote → mark in progress → upload evidence → sign-off). Uses
// `myStatus` isolation so a supplier only ever sees their own quote state, never
// another supplier's progress.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertOctagon, AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ReceiptText, Camera, FileText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { SupplierTicketRow } from '@/lib/health/data'
import { Modal } from '@/components/ui/Modal'
import { PhotoThumbs } from '@/components/ui/PhotoThumbs'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { errMsg } from '@/components/ui/errMsg'
import { SendQuoteForm } from '@/components/admin/SendQuoteForm'
import { SubmitCompletionForm } from '@/components/supplier/SubmitCompletionForm'
import { SupplierVariationGate, AcceptSnagCard, SnagRescheduleCta } from '@/components/supplier/SupplierJobActions'
import { DisputeReviewButton, RaiseDisputeMore, RaiseDisputeButton } from '@/components/dispute/DisputeBox'
import { TicketChat } from '@/components/chat/TicketChat'
import { MoreMenu, MoreActionItem } from '@/components/regional/rm-actions/ticket'
import { supplierStatusMeta, formatJobId, formatCurrency, formatDate, OPERATIONAL_IMPACT_LABELS, PRIORITY_LEVEL_LABELS } from '@/lib/utils'
import {
  byUrgencyThenNewest, EmptyQueue, isActive, isCriticalPriority, MetricButton, priorityBadgeClass,
  QueueCard, queueCtaClass, QueueRowBadges, QueueRowNextStep, QueueRowShell, QueueRowTitle,
} from '@/components/workqueue/shared'

type QueueFilter = 'all' | 'to_quote' | 'attend' | 'evidence' | 'snags' | 'sla'

// The status THIS supplier should see — never another supplier's progress (e.g.
// "Quoted" because someone else quoted). Mirrors app/supplier/page.tsx + SupplierTickets.
function myStatus(t: SupplierTicketRow): string {
  if (t.awardedToMe || t.declinedForMe) return t.status
  return t.quotedByMe ? 'quoted' : 'quote_requested'
}

// Each KPI card counts (and filters the queue to) one slice of the supplier's work.
const toQuote = (t: SupplierTicketRow) => !t.declinedForMe && myStatus(t) === 'quote_requested'
const toAttend = (t: SupplierTicketRow) => t.awardedToMe && ['accepted', 'scheduled'].includes(t.status)
const EVIDENCE_STATUSES = new Set(['in_progress', 'evidence_requested', 'snag_in_progress', 'snag_resolved'])
const needsEvidence = (t: SupplierTicketRow) => t.awardedToMe && EVIDENCE_STATUSES.has(t.status)
const SNAG_STATUSES = new Set(['snag', 'snag_assigned'])
const isSnag = (t: SupplierTicketRow) => t.awardedToMe && SNAG_STATUSES.has(t.status)
const slaAtRisk = (t: SupplierTicketRow) => t.breached || t.overdue

export function SupplierPriorityWorkQueue({ tickets, generatedAt, company, chatUnread }: { tickets: SupplierTicketRow[]; generatedAt: string; company?: string; chatUnread?: Record<string, number> }) {
  const [filter, setFilter] = useState<QueueFilter>('all')
  const nowMs = new Date(generatedAt).getTime()
  const pick = (k: QueueFilter) => setFilter(f => (f === k ? 'all' : k))

  // A supplier that was declined (and not re-invited) is out of their active work.
  const activeTickets = useMemo(() => tickets.filter(t => isActive(t.status) && !t.declinedForMe), [tickets])

  const counts = useMemo(() => ({
    to_quote: activeTickets.filter(toQuote).length,
    attend: activeTickets.filter(toAttend).length,
    evidence: activeTickets.filter(needsEvidence).length,
    snags: activeTickets.filter(isSnag).length,
    sla: activeTickets.filter(slaAtRisk).length,
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
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricButton active={filter === 'to_quote'} icon={<ReceiptText size={21} />} tone="blue" label="To Quote"
          value={counts.to_quote} sub={counts.to_quote ? `${counts.to_quote} to send` : 'All quoted'} subActive={counts.to_quote > 0} onClick={() => pick('to_quote')} />
        <MetricButton active={filter === 'attend'} icon={<CalendarClock size={21} />} tone="green" label="To Attend"
          value={counts.attend} sub={counts.attend ? `${counts.attend} awarded` : 'Nothing to start'} subActive={counts.attend > 0} onClick={() => pick('attend')} />
        <MetricButton active={filter === 'evidence'} icon={<Camera size={21} />} tone="orange" label="Upload Evidence"
          value={counts.evidence} sub={counts.evidence ? `${counts.evidence} to upload` : 'None outstanding'} subActive={counts.evidence > 0} onClick={() => pick('evidence')} />
        <MetricButton active={filter === 'snags'} icon={<AlertOctagon size={21} />} tone="gold" label="Snags"
          value={counts.snags} sub={counts.snags ? `${counts.snags} to fix` : 'No open snags'} subActive={counts.snags > 0} onClick={() => pick('snags')} />
        <MetricButton active={filter === 'sla'} icon={<AlertTriangle size={21} />} tone="red" label="SLA at Risk"
          value={counts.sla} sub={counts.sla ? `${counts.sla} breaching` : 'On track'} subActive={counts.sla > 0} onClick={() => pick('sla')} />
      </section>

      <QueueCard viewAllHref="/supplier/tickets">
        {rows.length ? rows.map(t => <QueueRow key={t.id} ticket={t} nowMs={nowMs} company={company} chatUnread={chatUnread?.[t.id] ?? 0} />) : (
          <div className="px-4 py-10"><EmptyQueue copy={emptyCopy(filter)} /></div>
        )}
      </QueueCard>
    </div>
  )
}

function emptyCopy(filter: QueueFilter): string {
  return filter === 'to_quote' ? 'No jobs waiting for a quote.'
    : filter === 'attend' ? 'No awarded jobs to start.'
    : filter === 'evidence' ? 'No evidence outstanding.'
    : filter === 'snags' ? 'No open snags.'
    : filter === 'sla' ? 'No jobs are breaching SLA.'
    : 'No active jobs right now.'
}

function QueueRow({ ticket, nowMs, company, chatUnread = 0 }: { ticket: SupplierTicketRow; nowMs: number; company?: string; chatUnread?: number }) {
  const slaDeadline = ticket.nextActionDueAt ?? ticket.dueAt
  const slaMs = new Date(slaDeadline).getTime() - nowMs
  const breached = ticket.overdue || ticket.breached || slaMs <= 0
  const status = myStatus(ticket)
  const meta = supplierStatusMeta(status)
  // Close-out phase: the badge is amber while the supplier still owes a VO decision,
  // blue once they've confirmed there are none (awaiting the RM's close-out).
  const closeout = ['approved_closeout', 'vo_declined'].includes(ticket.status) && ticket.awardedToMe
  const statusCls = ticket.disputed ? 'bg-violet-500/15 text-violet-700 dark:text-violet-400' : closeout ? (ticket.voNoneConfirmed ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400') : meta.cls
  const statusLabel = ticket.disputed ? 'Dispute' : closeout ? 'Close-out' : meta.label
  const ticketUrl = `/supplier/tickets/${ticket.id}`
  const who = ticket.isIndividual ? 'Individual' : [company, ticket.storeName].filter(Boolean).join(' · ')
  // Phase CTA — labelled by what the supplier does next. Disputed → view the dispute
  // chat; snagged → view the snag; the rest open a pop-up or the ticket.
  const cta = ticket.disputed ? 'View dispute'
    : ticket.requoteRequested ? 'View & re-quote'
    : toQuote(ticket) ? 'Submit quote'
    : ['accepted', 'scheduled'].includes(ticket.status) && ticket.awardedToMe ? 'Mark in progress'
    : needsEvidence(ticket) ? 'Upload evidence'
    : ticket.status === 'snag' && ticket.snagScheduleStatus === 'declined' ? 'Re-schedule'
    : ticket.status === 'snag_assigned' && ticket.snagScheduleStatus === 'agreed' ? 'Start snag'
    : isSnag(ticket) ? 'View snag'
    : ticket.status === 'vo_declined' && ticket.awardedToMe ? 'View VO'
    : 'View Ticket'
  const ctaCls = queueCtaClass(isCriticalPriority(ticket.priority))
  const jobId = ticket.jobRef ?? formatJobId(ticket.jobNumber)

  return (
    <QueueRowShell href={ticketUrl} ariaLabel={`View ${ticket.category || ticket.title} ticket`}>
      <QueueRowTitle category={ticket.category} title={ticket.title} priority={String(ticket.priority)} jobId={jobId} subtitle={who} />

      <QueueRowBadges priority={String(ticket.priority)} statusCls={statusCls} statusLabel={statusLabel}
        disputeUnread={ticket.disputeUnread} chatUnread={chatUnread} note={ticket.awardedToMe ? 'Awarded to you' : 'Invited to quote'} />

      <QueueRowNextStep createdAt={ticket.createdAt} nextStep={nextStep(ticket)} breached={breached} slaMs={slaMs} slaDeadline={slaDeadline} />

      <div className="flex lg:justify-end">
        {cta === 'View dispute'
          ? <DisputeReviewButton ticketId={ticket.id} viewerRole="supplier" trigger={open => <button type="button" onClick={open} className={ctaCls}>View Dispute</button>} />
          : ticket.requoteRequested
          ? <ReQuoteCta ticket={ticket} className={ctaCls} company={company} />
          : toQuote(ticket)
          ? <SubmitQuoteCta ticket={ticket} className={ctaCls} company={company} />
          : cta === 'View VO'
          ? <ViewVoCta ticket={ticket} className={ctaCls} company={company} />
          : closeout && ticket.status !== 'vo_declined' && !ticket.voNoneConfirmed
          ? <CloseOutCta ticket={ticket} className={ctaCls} />
          : cta === 'Mark in progress'
          ? <MarkInProgressCta ticket={ticket} className={ctaCls} />
          : cta === 'Upload evidence'
          ? <UploadEvidenceCta ticket={ticket} className={ctaCls} />
          : cta === 'Re-schedule'
          ? <SnagRescheduleCta ticketId={ticket.id} priority={String(ticket.priority)} createdAt={ticket.createdAt}
              declinedProposedAt={ticket.snagScheduledAt} declineReason={ticket.snagScheduleDeclineReason} className={ctaCls} />
          : cta === 'Start snag'
          ? <StartSnagCta ticket={ticket} className={ctaCls} />
          : cta === 'View snag'
          ? <ViewSnagCta ticket={ticket} className={ctaCls} company={company} />
          : <Link href={ticketUrl} className={ctaCls}>{cta} {cta === 'View Ticket' && <ArrowRight size={15} />}</Link>}
      </div>
    </QueueRowShell>
  )
}

// Ticket detail a supplier reviews before quoting — fetched on pop-up open from
// the supplier-scoped quote-context route (mirrors the RM's View & Assign
// context). Kept lean: store · impact · description · photos.
type QuoteContext = { title: string; category: string | null; description: string | null; impact: string | null; priority: string; jobRef: string | null; storeName: string | null; photoUrls: string[] }
type DeclinedQuote = { amount: number | null; amountInclVat: number | null; description: string | null; fileUrl: string | null; declineReason: string | null; validUntil: string | null; createdAt: string }
// `tile` renders the flat ticket-tile look (description → impact line → photos,
// no inner card — the pop-up header above it already carries store/category), used
// by the Submit-quote pop-up; the default card look serves the re-quote pop-up.
function TicketContextPanel({ ticketId, showDeclined = false, tile = false }: { ticketId: string; showDeclined?: boolean; tile?: boolean }) {
  const [ctx, setCtx] = useState<QuoteContext | null>(null)
  const [declined, setDeclined] = useState<DeclinedQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    fetch(`/api/tickets/${ticketId}/quote-context`)
      .then(r => r.json())
      .then(d => { if (!live) return; if (d?.error) setErr(d.error); else { setCtx(d.ticket); setDeclined(d.declinedQuote ?? null) } })
      .catch(() => { if (live) setErr('Could not load the job details.') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [ticketId])

  if (loading) return <p className="py-3 text-center text-sm text-[var(--text-faint)]">Loading job details…</p>
  if (err || !ctx) return err ? <p className="text-sm text-red-500">{err}</p> : null
  if (tile) {
    return (
      <div className="space-y-3">
        {ctx.description && <p className="whitespace-pre-line break-words text-sm text-[var(--text)]">{ctx.description}</p>}
        {ctx.impact && <p className="text-xs text-[var(--text-muted)]">Impact · <span className="font-semibold text-[var(--text)]">{OPERATIONAL_IMPACT_LABELS[ctx.impact] ?? ctx.impact}</span></p>}
        {ctx.photoUrls.length > 0 && <PhotoThumbs urls={ctx.photoUrls} ticketId={ticketId} label="Job photo" limit={5} />}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {/* Re-quote flow: the supplier's own declined quote — amount + attachment they
          need to revise (the decline reason itself shows above, in the amber block). */}
      {showDeclined && declined && (
        <div className="space-y-2 rounded-xl bg-[var(--surface-2)] p-4 ring-1 ring-[var(--border)]">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Your declined quote</p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            {declined.amount != null && <span className="font-bold text-[var(--text)]">{formatCurrency(declined.amount)} <span className="text-xs font-normal text-[var(--text-faint)]">excl VAT</span></span>}
            {declined.amountInclVat != null && <span className="text-[var(--text-muted)]">{formatCurrency(declined.amountInclVat)} <span className="text-xs text-[var(--text-faint)]">incl VAT</span></span>}
          </div>
          {declined.description && <p className="whitespace-pre-line break-words text-sm text-[var(--text-muted)]">{declined.description}</p>}
          {declined.fileUrl && (
            <ViewTrackedLink ticketId={ticketId} itemType="quote" itemLabel="Declined quote" href={declined.fileUrl}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline">
              <FileText size={15} /> View quote attachment
            </ViewTrackedLink>
          )}
        </div>
      )}
      <div className="space-y-3 rounded-xl bg-[var(--surface-2)] p-4 ring-1 ring-[var(--border)]">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
          {ctx.storeName && <span><span className="text-[var(--text-faint)]">Store</span> <span className="font-semibold text-[var(--text)]">{ctx.storeName}</span></span>}
          {ctx.category && <span><span className="text-[var(--text-faint)]">Category</span> <span className="font-semibold text-[var(--text)]">{ctx.category}</span></span>}
          {ctx.impact && <span><span className="text-[var(--text-faint)]">Impact</span> <span className="font-semibold text-[var(--text)]">{OPERATIONAL_IMPACT_LABELS[ctx.impact] ?? ctx.impact}</span></span>}
        </div>
        {ctx.description && (
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Description</p>
            <p className="whitespace-pre-line break-words text-sm text-[var(--text)]">{ctx.description}</p>
          </div>
        )}
        {ctx.photoUrls.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Photos</p>
            <PhotoThumbs urls={ctx.photoUrls} ticketId={ticketId} label="Job photo" limit={5} />
          </div>
        )}
      </div>
    </div>
  )
}

// "Submit quote" is a TWO-STEP pop-up: first the job detail rendered like the
// ticket tile (job id + logged date · bold title · store · priority/status
// badges · description · impact · photos), with a blue "Continue to quote"
// button that THEN opens the quote-upload form in a second pop-up.
function SubmitQuoteCta({ ticket, className, company }: { ticket: SupplierTicketRow; className: string; company?: string }) {
  const [open, setOpen] = useState(false)
  const [quoting, setQuoting] = useState(false)
  const status = myStatus(ticket)
  const meta = supplierStatusMeta(status)
  const jobId = ticket.jobRef ?? formatJobId(ticket.jobNumber)
  const who = ticket.isIndividual ? 'Individual' : [company, ticket.storeName, ticket.branchCode].filter(Boolean).join(' · ')
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>Submit Quote</button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-3xl">
          {close => (
            <div className="space-y-4">
              {/* Tile-style header — mirrors the Today-queue row. */}
              <div className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  {jobId && <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">{jobId}</p>}
                  <p className="ml-auto text-xs text-[var(--text-faint)]">{formatDate(ticket.createdAt)}</p>
                </div>
                <h3 className="text-lg font-bold leading-snug text-[var(--text)]">{ticket.category || ticket.title}</h3>
                {who && <p className="text-sm text-[var(--text-muted)]">{who}</p>}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${priorityBadgeClass(String(ticket.priority))}`}>{PRIORITY_LEVEL_LABELS[String(ticket.priority)] ?? 'Medium'}</span>
                  <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
                </div>
              </div>
              <TicketContextPanel ticketId={ticket.id} tile />
              <button type="button" onClick={() => setQuoting(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
                <ReceiptText size={16} /> Continue to quote
              </button>
              {quoting && (
                <Modal onClose={() => setQuoting(false)} maxWidth="max-w-3xl">
                  {closeQuote => (
                    <div className="space-y-4">
                      <h3 className="text-base font-bold text-[var(--text)]">Submit your quote</h3>
                      <SendQuoteForm defaultOpen competitive ticketId={ticket.id} priority={String(ticket.priority)} createdAt={ticket.createdAt} onClose={() => { closeQuote(); close() }} />
                    </div>
                  )}
                </Modal>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

// "View & re-quote" from the Today queue — the RM declined this supplier's quote
// and asked them to revise it. Shows the decline reason + the declined quote + job
// detail, a Re-quote button (opens the upload form) and a small More beside it
// (Cancel; quote declines are not disputable from here).
function ReQuoteCta({ ticket, className }: { ticket: SupplierTicketRow; className: string; company?: string }) {
  const [open, setOpen] = useState(false)
  const [quoting, setQuoting] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>View &amp; Re-Quote</button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-3xl">
          {close => (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-[var(--text)]">Quote declined — revise &amp; resubmit</h3>
              <div className="space-y-1 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5">
                <p className="text-sm text-[var(--text)]">The manager declined your quote and asked you to revise and resubmit it.</p>
                {ticket.declineReason && (
                  <p className="text-sm text-[var(--text-muted)]"><span className="font-semibold text-[var(--text)]">Reason:</span> {ticket.declineReason}</p>
                )}
              </div>

              <TicketContextPanel ticketId={ticket.id} showDeclined />

              {/* Pop-up convention: small More beside the primary button, menu opens up-right. */}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setQuoting(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
                  <ReceiptText size={16} /> Re-quote
                </button>
                <MoreMenu up align="right">
                  <MoreActionItem label="Cancel" onClick={close} />
                </MoreMenu>
              </div>

              {quoting && (
                <Modal onClose={() => setQuoting(false)} maxWidth="max-w-3xl">
                  {closeQuote => (
                    <div className="space-y-4">
                      <h3 className="text-base font-bold text-[var(--text)]">Submit your revised quote</h3>
                      <SendQuoteForm defaultOpen competitive ticketId={ticket.id} priority={String(ticket.priority)} createdAt={ticket.createdAt} onClose={() => { closeQuote(); close() }} />
                    </div>
                  )}
                </Modal>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

// "Mark in progress" from the Today queue — confirm in a pop-up (start_work), no
// navigation into the ticket.
function MarkInProgressCta({ ticket, className }: { ticket: SupplierTicketRow; className: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function go(close: () => void) {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start_work' }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not update the job')
      close(); router.refresh()
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>Mark In Progress</button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-md">
          {close => (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-[var(--text)]">Mark this job in progress?</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">The store will see that the work has started. Do this once you&apos;re on your way or on site.</p>
              </div>
              {err && <p className="text-xs text-red-500">{err}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} disabled={busy} className="flex-1 rounded-xl py-2.5 text-sm font-medium text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-50">Cancel</button>
                <button type="button" onClick={() => go(close)} disabled={busy} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">{busy ? 'Starting…' : 'Yes, mark in progress'}</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

// "Mark in progress" for an APPROVED snag schedule — confirm in a pop-up, fires
// start_snag (the snag counterpart of MarkInProgressCta's start_work).
function StartSnagCta({ ticket, className }: { ticket: SupplierTicketRow; className: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function go(close: () => void) {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start_snag' }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not update the job')
      close(); router.refresh()
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>Mark In Progress</button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-md">
          {close => (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-[var(--text)]">Start the snag fix?</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  The manager approved your proposed time{ticket.snagScheduledAt ? <> (<span className="font-semibold text-[var(--text)]">{formatDate(ticket.snagScheduledAt)}</span>)</> : null}. Mark the snag fix in progress once you&apos;re on your way or on site.
                </p>
              </div>
              {err && <p className="text-xs text-red-500">{err}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} disabled={busy} className="flex-1 rounded-xl py-2.5 text-sm font-medium text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-50">Cancel</button>
                <button type="button" onClick={() => go(close)} disabled={busy} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">{busy ? 'Starting…' : 'Yes, mark in progress'}</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

// Variation-order context for the queue pop-ups — the caller's declined VO (for
// the re-submit flow) + the approved VOs (shown at close-out). Fetched on open
// from the supplier-scoped quote-context route (awarded-org gated server-side).
type DeclinedVo = { amount: number | null; description: string | null; rejectReason: string | null; fileUrls: string[]; createdAt: string }
type ApprovedVo = { amount: number | null; description: string | null; createdAt: string }
function useVoContext(ticketId: string) {
  const [declinedVo, setDeclinedVo] = useState<DeclinedVo | null>(null)
  const [approvedVos, setApprovedVos] = useState<ApprovedVo[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    fetch(`/api/tickets/${ticketId}/quote-context`)
      .then(r => r.json())
      .then(d => { if (!live || d?.error) return; setDeclinedVo(d.declinedVariation ?? null); setApprovedVos(Array.isArray(d.approvedVariations) ? d.approvedVariations : []) })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [ticketId])
  return { declinedVo, approvedVos, loading }
}

// "View VO" from the Today queue — the RM declined this supplier's variation
// order. Shows the declined VO + reason, a Re-submit VO button (opens the VO
// upload form) and a small More beside it (Raise dispute · Chat with the client).
function ViewVoCta({ ticket, className, company }: { ticket: SupplierTicketRow; className: string; company?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>View VO</button>
      {open && <ViewVoModal ticket={ticket} company={company} onClose={() => setOpen(false)} />}
    </>
  )
}
function ViewVoModal({ ticket, company, onClose }: { ticket: SupplierTicketRow; company?: string; onClose: () => void }) {
  const [resubmitting, setResubmitting] = useState(false)
  const [disputing, setDisputing] = useState(false)
  const [chatting, setChatting] = useState(false)
  const { declinedVo, loading } = useVoContext(ticket.id)
  const store = ticket.isIndividual ? 'Individual' : [company, ticket.storeName, ticket.branchCode].filter(Boolean).join(' · ')
  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      {close => (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-[var(--text)]">Variation order declined</h3>
          <div className="space-y-1 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5">
            <p className="text-sm text-[var(--text)]">The manager declined your variation order. Re-submit a revised one, or confirm there are no further variation orders from the ticket.</p>
            {declinedVo?.rejectReason && (
              <p className="text-sm text-[var(--text-muted)]"><span className="font-semibold text-[var(--text)]">Reason:</span> {declinedVo.rejectReason}</p>
            )}
          </div>

          {loading ? (
            <p className="py-2 text-center text-sm text-[var(--text-faint)]">Loading the variation order…</p>
          ) : declinedVo ? (
            <div className="space-y-2 rounded-xl bg-[var(--surface-2)] p-4 ring-1 ring-[var(--border)]">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Your declined variation order</p>
              {declinedVo.amount != null && <p className="text-sm font-bold text-[var(--text)]">{formatCurrency(declinedVo.amount)} <span className="text-xs font-normal text-[var(--text-faint)]">excl VAT</span></p>}
              {declinedVo.description && <p className="whitespace-pre-line break-words text-sm text-[var(--text-muted)]">{declinedVo.description}</p>}
              {declinedVo.fileUrls.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
                  {declinedVo.fileUrls.map((u, i) => (
                    <ViewTrackedLink key={i} ticketId={ticket.id} itemType="attachment" itemLabel={`Declined VO attachment ${i + 1}`} href={u}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline">
                      <FileText size={15} /> Attachment {i + 1}
                    </ViewTrackedLink>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-faint)]">The declined variation order is no longer available.</p>
          )}

          {/* Pop-up convention: small More beside the primary button, menu opens up-right. */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setResubmitting(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
              <ReceiptText size={16} /> Re-submit VO
            </button>
            <MoreMenu up align="right">
              <MoreActionItem label="Raise dispute" tone="danger" onClick={() => setDisputing(true)} />
              <MoreActionItem label="Chat with the client" onClick={() => setChatting(true)} />
            </MoreMenu>
          </div>

          {resubmitting && (
            <Modal onClose={() => setResubmitting(false)} maxWidth="max-w-2xl">
              {closeVo => <div><SendQuoteForm ticketId={ticket.id} variant="variation" competitive priority={String(ticket.priority)} createdAt={ticket.createdAt} defaultOpen onClose={() => { closeVo(); close() }} /></div>}
            </Modal>
          )}
          {disputing && <RaiseDisputeButton ticketId={ticket.id} origin="variation" subjectTitle={ticket.category || ticket.title} jobRef={ticket.jobRef} store={store} defaultOpen onClose={() => setDisputing(false)} />}
          {chatting && <TicketChat ticketId={ticket.id} viewerRole="supplier" defaultOpen onClose={() => setChatting(false)} />}
        </div>
      )}
    </Modal>
  )
}

// "Upload evidence" from the Today queue — opens the COC/POC (or more-evidence)
// uploader in a pop-up, no navigation into the ticket.
function UploadEvidenceCta({ ticket, className }: { ticket: SupplierTicketRow; className: string }) {
  const [open, setOpen] = useState(false)
  const evidenceRequested = ticket.status === 'evidence_requested'
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>Upload Evidence</button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-2xl">
          {close => <SubmitCompletionForm defaultOpen ticketId={ticket.id} evidenceRequested={evidenceRequested} evidenceRequestReason={ticket.evidenceRequestReason} requireBoth={!evidenceRequested} onClose={close} />}
        </Modal>
      )}
    </>
  )
}

// "View snag" from the Today queue — pops the snagged-completion context with the
// relevant actions in place (Accept snag & schedule fix + More → Raise dispute),
// plus a link to the full snagged submission on the ticket.
type SnagContext = { beforeUrls: string[]; afterUrls: string[]; cocUrl: string | null; invoiceUrl: string | null; notes: string | null; rejectReason: string | null; submittedAt: string | null }
// The snagged completion (before/after photos, COC & invoice, notes) — fetched on
// open so the supplier sees exactly what was sent back before accepting the snag.
function SnaggedCompletion({ ticketId }: { ticketId: string }) {
  const [ctx, setCtx] = useState<SnagContext | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    fetch(`/api/tickets/${ticketId}/snag-context`)
      .then(r => r.json())
      .then(d => { if (live) setCtx(d.signoff) })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [ticketId])
  if (loading) return <p className="py-2 text-center text-sm text-[var(--text-faint)]">Loading the snagged completion…</p>
  if (!ctx) return null
  const docs = [ctx.cocUrl && { label: 'Certificate of Compliance', url: ctx.cocUrl }, ctx.invoiceUrl && { label: 'Invoice', url: ctx.invoiceUrl }].filter(Boolean) as { label: string; url: string }[]
  return (
    <div className="space-y-3 rounded-xl bg-[var(--surface-2)] p-4 ring-1 ring-[var(--border)]">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Your snagged submission</p>
      {ctx.beforeUrls.length > 0 && <div><p className="mb-1 text-xs font-semibold text-[var(--text)]">Before</p><PhotoThumbs urls={ctx.beforeUrls} ticketId={ticketId} label="Before photo" limit={5} /></div>}
      {ctx.afterUrls.length > 0 && <div><p className="mb-1 text-xs font-semibold text-[var(--text)]">After</p><PhotoThumbs urls={ctx.afterUrls} ticketId={ticketId} label="After photo" limit={5} /></div>}
      {docs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {docs.map((d, i) => (
            <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface)] px-2.5 py-1.5 text-[13px] font-medium text-blue-600 ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] dark:text-blue-400"><FileText size={14} /> {d.label}</a>
          ))}
        </div>
      )}
      {ctx.notes && <p className="text-[13px] text-[var(--text-muted)]"><span className="font-semibold text-[var(--text)]">Your notes:</span> {ctx.notes}</p>}
      {ctx.beforeUrls.length === 0 && ctx.afterUrls.length === 0 && docs.length === 0 && !ctx.notes && (
        <p className="text-sm text-[var(--text-faint)]">The original submission is no longer available.</p>
      )}
    </div>
  )
}

function ViewSnagCta({ ticket, className, company }: { ticket: SupplierTicketRow; className: string; company?: string }) {
  const [open, setOpen] = useState(false)
  const store = ticket.isIndividual ? 'Individual' : [company, ticket.storeName, ticket.branchCode].filter(Boolean).join(' · ')
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>View Snag</button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-3xl">
          {close => (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-[var(--text)]">Completion snagged</h3>
              <p className="text-sm text-[var(--text-muted)]">The regional manager raised a snag on your completion. Review what was sent back below, then accept the snag and schedule the corrective work — or raise a dispute if you disagree.</p>
              {/* Why it was sent back. */}
              {ticket.snagReason && (
                <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3 space-y-0.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Why it was sent back</p>
                  <p className="text-sm text-[var(--text)]">{ticket.snagReason}</p>
                </div>
              )}
              {/* The snagged completion itself. */}
              <SnaggedCompletion ticketId={ticket.id} />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="flex-1"><AcceptSnagCard ticketId={ticket.id} priority={String(ticket.priority)} createdAt={ticket.createdAt} /></div>
                <RaiseDisputeMore ticketId={ticket.id} origin="snag" subjectTitle={ticket.category || ticket.title} jobRef={ticket.jobRef} store={store} />
              </div>
              <Link href={`/supplier/tickets/${ticket.id}`} onClick={close} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">View full snag details <ArrowRight size={14} /></Link>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

// "Close-out" opens the variation-order gate in place — the supplier raises a VO
// (via More) or confirms there are none so the manager can close out. Any VOs the
// manager has already APPROVED are listed so the supplier sees what's covered.
function CloseOutCta({ ticket, className }: { ticket: SupplierTicketRow; className: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}><CheckCircle2 size={15} /> Close-out</button>
      {open && <CloseOutModal ticket={ticket} onClose={() => setOpen(false)} />}
    </>
  )
}
function CloseOutModal({ ticket, onClose }: { ticket: SupplierTicketRow; onClose: () => void }) {
  const { approvedVos } = useVoContext(ticket.id)
  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      {() => (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-bold text-[var(--text)]">Variation orders</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Your COC &amp; POC were approved — raise a variation order for any extra work, or confirm there are none so the manager can close out.</p>
          </div>
          {approvedVos.length > 0 && (
            <div className="space-y-2 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Approved variation order{approvedVos.length > 1 ? 's' : ''}</p>
              {approvedVos.map((v, i) => (
                <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                  {v.amount != null && <span className="font-bold text-[var(--text)]">{formatCurrency(v.amount)}</span>}
                  {v.description && <span className="min-w-0 flex-1 break-words text-[var(--text-muted)]">{v.description}</span>}
                </div>
              ))}
            </div>
          )}
          <SupplierVariationGate ticketId={ticket.id} priority={String(ticket.priority)} createdAt={ticket.createdAt} variationCount={0} status={ticket.status as 'approved_closeout' | 'vo_declined'} declineReason={null} noVosConfirmed={false} />
        </div>
      )}
    </Modal>
  )
}

function matchesFilter(t: SupplierTicketRow, filter: QueueFilter): boolean {
  switch (filter) {
    case 'all': return true
    case 'to_quote': return toQuote(t)
    case 'attend': return toAttend(t)
    case 'evidence': return needsEvidence(t)
    case 'snags': return isSnag(t)
    case 'sla': return slaAtRisk(t)
  }
}

function nextStep(t: SupplierTicketRow): string {
  const s = myStatus(t)
  if (t.requoteRequested) return 'Quote declined — revise and resubmit'
  if (s === 'quote_requested') return 'Submit a quote'
  if (s === 'quoted') return "Awaiting the client's decision"
  if (['accepted', 'scheduled'].includes(t.status)) return 'Mark the job in progress when you start'
  if (t.status === 'in_progress') return 'Upload the COC & POC'
  if (t.status === 'evidence_requested') return 'Add the requested evidence'
  if (t.status === 'snag' && t.snagScheduleStatus === 'declined') return 'Schedule declined — propose a new time'
  if (t.status === 'snag_assigned' && t.snagScheduleStatus === 'proposed') return 'Awaiting schedule approval from the manager'
  if (t.status === 'snag_assigned' && t.snagScheduleStatus === 'agreed') return 'Schedule approved — start the snag fix'
  if (['snag', 'snag_assigned'].includes(t.status)) return 'Accept and schedule the snag fix'
  if (['snag_in_progress', 'snag_resolved'].includes(t.status)) return 'Re-upload the COC & POC'
  if (t.status === 'submitted_for_signoff') return 'Awaiting the client sign-off'
  if (t.status === 'vo_declined') return 'Variation order declined — re-submit or confirm none'
  if (t.status === 'approved_closeout') {
    if (t.voNoneConfirmed) return "Awaiting the manager's close-out"
    return t.hasApprovedVo ? 'VO approved — raise another or confirm none for close-out' : 'Raise or confirm variation orders'
  }
  return 'Track progress on this job'
}
