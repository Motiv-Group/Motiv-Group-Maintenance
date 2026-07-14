'use client'

// Supplier equivalent of the SM/RM Priority Work Queue: filtering KPI cards over
// the supplier's active jobs, then an urgency-sorted queue with a phase-aware CTA
// per row. Same look/behaviour as components/regional/RegionalPriorityWorkQueue.tsx,
// with supplier lifecycle phases (submit quote → mark in progress → upload evidence
// → sign-off). Uses `myStatus` isolation so a supplier only ever sees their own
// quote state, never another supplier's progress.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, AlertOctagon, AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ClipboardList, ReceiptText, Camera, MessageSquare } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { SupplierTicketRow } from '@/lib/health/data'
import { Card } from '@/components/exec/ui'
import { CategoryIcon } from '@/components/client/ticketBadges'
import { Modal } from '@/components/ui/Modal'
import { SendQuoteForm } from '@/components/admin/SendQuoteForm'
import { SubmitCompletionForm } from '@/components/supplier/SubmitCompletionForm'
import { SchedulePicker } from '@/components/ui/SchedulePicker'
import { SupplierVariationGate } from '@/components/supplier/SupplierJobActions'
import { supplierStatusMeta, formatDate, formatDateTime, humanizeDuration, PRIORITY_LEVEL_LABELS } from '@/lib/utils'

type QueueFilter = 'all' | 'to_quote' | 'attend' | 'evidence' | 'snags' | 'sla'
type Tone = 'red' | 'purple' | 'gold' | 'green' | 'orange' | 'blue'

const URGENCY_RANK: Record<string, number> = { urgent: 0, P1: 0, high: 1, P2: 1, medium: 2, P3: 2, low: 3, P4: 3 }
const INACTIVE = new Set(['completed', 'cancelled', 'declined'])
const isActive = (s: string) => !INACTIVE.has(s)

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
      .sort((a, b) =>
        (URGENCY_RANK[String(a.priority)] ?? 9) - (URGENCY_RANK[String(b.priority)] ?? 9)
        || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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
            {rows.length ? rows.map(t => <QueueRow key={t.id} ticket={t} nowMs={nowMs} company={company} />) : (
              <div className="px-4 py-10"><EmptyQueue filter={filter} /></div>
            )}
            <div className="border-t border-[var(--border)] px-4 py-4">
              <Link href="/supplier/tickets" className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:underline dark:text-blue-400">
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
  const stateBorder = zero ? 'border-2 border-[var(--border)] dark:border-white/10' : 'border-2 border-amber-500/70'

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

function QueueRow({ ticket, nowMs, company }: { ticket: SupplierTicketRow; nowMs: number; company?: string }) {
  const slaDeadline = ticket.nextActionDueAt ?? ticket.dueAt
  const slaMs = new Date(slaDeadline).getTime() - nowMs
  const breached = ticket.overdue || ticket.breached || slaMs <= 0
  const status = myStatus(ticket)
  const meta = supplierStatusMeta(status)
  // Close-out phase: the badge is amber while the supplier still owes a VO decision,
  // blue once they've confirmed there are none (awaiting the RM's close-out).
  const closeout = ['approved_closeout', 'vo_declined'].includes(ticket.status) && ticket.awardedToMe
  const statusCls = ticket.disputed ? 'bg-red-500/15 text-red-700 dark:text-red-400' : closeout ? (ticket.voNoneConfirmed ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400') : meta.cls
  const statusLabel = ticket.disputed ? 'Dispute' : closeout ? 'Close-out' : meta.label
  const ticketUrl = `/supplier/tickets/${ticket.id}`
  const who = ticket.isIndividual ? 'Individual' : [company, ticket.storeName].filter(Boolean).join(' · ')
  // Phase CTA — labelled by what the supplier does next; all open the ticket (the
  // full multi-field actions — quote upload, COC/POC — live on the detail page).
  const cta = toQuote(ticket) ? 'Submit quote'
    : ['accepted', 'scheduled'].includes(ticket.status) && ticket.awardedToMe ? 'Mark in progress'
    : needsEvidence(ticket) ? 'Upload evidence'
    : isSnag(ticket) ? 'Accept snag'
    : 'View Ticket'
  // Genuinely critical (P1 / urgent) jobs get a RED action button so they stand out.
  const critical = ['P1', 'urgent'].includes(String(ticket.priority))
  const ctaCls = `relative z-20 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition lg:w-40 ${critical ? 'border-red-500/60 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-300' : 'border-blue-500/60 text-blue-600 hover:bg-blue-500/10 dark:text-blue-300'}`

  return (
    <div className="relative grid gap-4 border-b border-[var(--border)] px-4 py-4 transition last:border-b-0 hover:bg-[var(--hover)] lg:grid-cols-[1fr_200px_1.1fr_160px] lg:items-center">
      <Link href={ticketUrl} aria-label={`View ${ticket.category || ticket.title} ticket`} className="absolute inset-0 z-10" />

      <div className="flex min-w-0 items-center gap-3">
        <CategoryIcon category={ticket.category ?? ticket.title} priority={ticket.priority} />
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-[var(--text)]">{ticket.category || ticket.title}</p>
          <p className="truncate text-sm text-[var(--text-muted)]">{who}</p>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex w-[72px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${priorityBadgeClass(String(ticket.priority))}`}>{PRIORITY_LEVEL_LABELS[String(ticket.priority)] ?? 'Medium'}</span>
          <span className={`inline-flex w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${statusCls}`}>{statusLabel}</span>
          {ticket.disputeUnread && <span className="relative z-20 inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-blue-500/15 px-1.5 py-1 text-[10px] font-bold text-blue-700 dark:text-blue-400"><MessageSquare size={10} /> New message</span>}
        </div>
        <p className="mt-1.5 truncate text-sm text-[var(--text-muted)]">{ticket.awardedToMe ? 'Awarded to you' : 'Invited to quote'}</p>
      </div>

      <div className="min-w-0 border-l-0 border-[var(--border)] lg:border-l lg:pl-6">
        <p className="truncate text-xs text-[var(--text-muted)]">Next step · Logged {formatDate(ticket.createdAt)}</p>
        <p className="truncate text-sm font-bold text-[var(--text)]">{nextStep(ticket)}</p>
        {breached ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-red-600 dark:text-red-400"><AlertCircle size={14} /> SLA breached</p>
        ) : (
          <>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-muted)]"><CalendarClock size={14} /> SLA in {humanizeDuration(slaMs)}</p>
            <p className="truncate text-xs text-[var(--text-muted)]">Next deadline · {formatDateTime(slaDeadline)}</p>
          </>
        )}
      </div>

      <div className="flex lg:justify-end">
        {toQuote(ticket)
          ? <SubmitQuoteCta ticket={ticket} className={ctaCls} />
          : closeout && !ticket.voNoneConfirmed
          ? <CloseOutCta ticket={ticket} className={ctaCls} />
          : cta === 'Mark in progress'
          ? <MarkInProgressCta ticket={ticket} className={ctaCls} />
          : cta === 'Upload evidence'
          ? <UploadEvidenceCta ticket={ticket} className={ctaCls} />
          : cta === 'Accept snag'
          ? <AcceptSnagCta ticket={ticket} className={ctaCls} />
          : <Link href={ticketUrl} className={ctaCls}>{cta} {cta === 'View Ticket' && <ArrowRight size={15} />}</Link>}
      </div>
    </div>
  )
}

// "Submit quote" opens the full quote-upload pop-up in place (same SendQuoteForm as
// the ticket detail), so the supplier can quote straight from the Today queue.
function SubmitQuoteCta({ ticket, className }: { ticket: SupplierTicketRow; className: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>Submit quote</button>
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
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>Mark in progress</button>
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
      <button type="button" onClick={() => setOpen(true)} className={className}>Upload evidence</button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-2xl">
          {close => <SubmitCompletionForm defaultOpen ticketId={ticket.id} evidenceRequested={evidenceRequested} requireBoth={!evidenceRequested} onClose={close} />}
        </Modal>
      )}
    </>
  )
}

// "Accept snag" from the Today queue — opens the snag-fix schedule picker in a
// pop-up (accept_snag transition), no navigation into the ticket.
function AcceptSnagCta({ ticket, className }: { ticket: SupplierTicketRow; className: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function accept(iso: string, close: () => void) {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept_snag', scheduledAt: iso }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not accept the snag')
      close(); router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>Accept snag</button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-2xl">
          {close => (
            <div className="space-y-3">
              <h3 className="text-base font-bold text-[var(--text)]">Accept snag &amp; schedule the fix</h3>
              {err && <p className="text-xs text-red-500">{err}</p>}
              <SchedulePicker priority={String(ticket.priority)} createdAt={ticket.createdAt} busy={busy} onConfirm={iso => accept(iso, close)} onCancel={close} />
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

function EmptyQueue({ filter }: { filter: QueueFilter }) {
  const copy = filter === 'to_quote' ? 'No jobs waiting for a quote.'
    : filter === 'attend' ? 'No awarded jobs to start.'
    : filter === 'evidence' ? 'No evidence outstanding.'
    : filter === 'snags' ? 'No open snags.'
    : filter === 'sla' ? 'No jobs are breaching SLA.'
    : 'No active jobs right now.'
  return (
    <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center">
      <div>
        <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-faint)]"><CheckCircle2 size={24} /></div>
        <p className="text-sm font-semibold text-[var(--text-muted)]">{copy}</p>
      </div>
    </div>
  )
}

function priorityBadgeClass(p: string): string {
  if (p === 'urgent' || p === 'P1') return 'bg-red-500/15 text-red-600 dark:text-red-400'
  if (p === 'high' || p === 'P2') return 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
  if (p === 'medium' || p === 'P3') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  return 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
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
