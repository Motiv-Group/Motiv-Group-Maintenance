'use client'

// Supplier equivalent of the SM/RM Priority Work Queue: filtering KPI cards over
// the supplier's active jobs, then an urgency-sorted queue with a phase-aware CTA
// per row. Same look/behaviour as components/regional/RegionalPriorityWorkQueue.tsx
// (shared internals in components/workqueue/shared.tsx), with supplier lifecycle
// phases (submit quote → mark in progress → upload evidence → sign-off). Uses
// `myStatus` isolation so a supplier only ever sees their own quote state, never
// another supplier's progress.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertOctagon, AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ReceiptText, Camera } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { SupplierTicketRow } from '@/lib/health/data'
import { Modal } from '@/components/ui/Modal'
import { errMsg } from '@/components/ui/errMsg'
import { SendQuoteForm } from '@/components/admin/SendQuoteForm'
import { SubmitCompletionForm } from '@/components/supplier/SubmitCompletionForm'
import { SupplierVariationGate, AcceptSnagCard } from '@/components/supplier/SupplierJobActions'
import { DisputeReviewButton, RaiseDisputeMore } from '@/components/dispute/DisputeBox'
import { supplierStatusMeta, formatJobId } from '@/lib/utils'
import {
  byUrgencyThenNewest, EmptyQueue, isActive, isCriticalPriority, MetricButton,
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

export function SupplierPriorityWorkQueue({ tickets, generatedAt, company }: { tickets: SupplierTicketRow[]; generatedAt: string; company?: string }) {
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
        {rows.length ? rows.map(t => <QueueRow key={t.id} ticket={t} nowMs={nowMs} company={company} />) : (
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

function QueueRow({ ticket, nowMs, company }: { ticket: SupplierTicketRow; nowMs: number; company?: string }) {
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
    : toQuote(ticket) ? 'Submit quote'
    : ['accepted', 'scheduled'].includes(ticket.status) && ticket.awardedToMe ? 'Mark in progress'
    : needsEvidence(ticket) ? 'Upload evidence'
    : isSnag(ticket) ? 'View snag'
    : 'View Ticket'
  const ctaCls = queueCtaClass(isCriticalPriority(ticket.priority))
  const jobId = ticket.jobRef ?? formatJobId(ticket.jobNumber)

  return (
    <QueueRowShell href={ticketUrl} ariaLabel={`View ${ticket.category || ticket.title} ticket`}>
      <QueueRowTitle category={ticket.category} title={ticket.title} priority={String(ticket.priority)} jobId={jobId} subtitle={who} />

      <QueueRowBadges priority={String(ticket.priority)} statusCls={statusCls} statusLabel={statusLabel}
        disputeUnread={ticket.disputeUnread} note={ticket.awardedToMe ? 'Awarded to you' : 'Invited to quote'} />

      <QueueRowNextStep createdAt={ticket.createdAt} nextStep={nextStep(ticket)} breached={breached} slaMs={slaMs} slaDeadline={slaDeadline} />

      <div className="flex lg:justify-end">
        {cta === 'View dispute'
          ? <DisputeReviewButton ticketId={ticket.id} viewerRole="supplier" trigger={open => <button type="button" onClick={open} className={ctaCls}>View Dispute</button>} />
          : toQuote(ticket)
          ? <SubmitQuoteCta ticket={ticket} className={ctaCls} />
          : closeout && !ticket.voNoneConfirmed
          ? <CloseOutCta ticket={ticket} className={ctaCls} />
          : cta === 'Mark in progress'
          ? <MarkInProgressCta ticket={ticket} className={ctaCls} />
          : cta === 'Upload evidence'
          ? <UploadEvidenceCta ticket={ticket} className={ctaCls} />
          : cta === 'View snag'
          ? <ViewSnagCta ticket={ticket} className={ctaCls} company={company} />
          : <Link href={ticketUrl} className={ctaCls}>{cta} {cta === 'View Ticket' && <ArrowRight size={15} />}</Link>}
      </div>
    </QueueRowShell>
  )
}

// "Submit quote" opens the full quote-upload pop-up in place (same SendQuoteForm as
// the ticket detail), so the supplier can quote straight from the Today queue.
function SubmitQuoteCta({ ticket, className }: { ticket: SupplierTicketRow; className: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>Submit Quote</button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-3xl">
          {close => <div><SendQuoteForm defaultOpen competitive ticketId={ticket.id} priority={String(ticket.priority)} createdAt={ticket.createdAt} onClose={close} /></div>}
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
          {close => <SubmitCompletionForm defaultOpen ticketId={ticket.id} evidenceRequested={evidenceRequested} requireBoth={!evidenceRequested} onClose={close} />}
        </Modal>
      )}
    </>
  )
}

// "View snag" from the Today queue — pops the snagged-completion context with the
// relevant actions in place (Accept snag & schedule fix + More → Raise dispute),
// plus a link to the full snagged submission on the ticket.
function ViewSnagCta({ ticket, className, company }: { ticket: SupplierTicketRow; className: string; company?: string }) {
  const [open, setOpen] = useState(false)
  const store = ticket.isIndividual ? 'Individual' : [company, ticket.storeName, ticket.branchCode].filter(Boolean).join(' · ')
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>View Snag</button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-2xl">
          {close => (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-[var(--text)]">Completion snagged</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">The regional manager raised a snag on your completion. Accept the snag and schedule the corrective work, or raise a dispute if you disagree.</p>
              </div>
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
// (via More) or confirms there are none so the manager can close out.
function CloseOutCta({ ticket, className }: { ticket: SupplierTicketRow; className: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}><CheckCircle2 size={15} /> Close-out</button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-2xl">
          {() => (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-[var(--text)]">Variation orders</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Your COC &amp; POC were approved — raise a variation order for any extra work, or confirm there are none so the manager can close out.</p>
              </div>
              <SupplierVariationGate ticketId={ticket.id} priority={String(ticket.priority)} createdAt={ticket.createdAt} variationCount={0} status={ticket.status as 'approved_closeout' | 'vo_declined'} declineReason={null} noVosConfirmed={false} />
            </div>
          )}
        </Modal>
      )}
    </>
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
  if (s === 'quote_requested') return 'Submit a quote'
  if (s === 'quoted') return "Awaiting the client's decision"
  if (['accepted', 'scheduled'].includes(t.status)) return 'Mark the job in progress when you start'
  if (t.status === 'in_progress') return 'Upload the COC & POC'
  if (t.status === 'evidence_requested') return 'Add the requested evidence'
  if (['snag', 'snag_assigned'].includes(t.status)) return 'Accept and schedule the snag fix'
  if (['snag_in_progress', 'snag_resolved'].includes(t.status)) return 'Re-upload the COC & POC'
  if (t.status === 'submitted_for_signoff') return 'Awaiting the client sign-off'
  if (['approved_closeout', 'vo_declined'].includes(t.status)) return t.voNoneConfirmed ? "Awaiting the manager's close-out" : 'Raise or confirm variation orders'
  return 'Track progress on this job'
}
