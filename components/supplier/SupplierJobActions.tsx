'use client'

// Supplier "Schedule job" action — a green button that opens a themed calendar
// (date + 1-hour time slot, capped by the ticket priority window and operating
// hours). The Submit COC & POC flow lives on its own page (/complete).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Wrench, PlayCircle, XCircle, X, FileText, Ticket, MapPin, Info, ArrowRight, Plus, MessageSquare } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { DrawerHeader } from '@/components/exec/Drawer'
import { SchedulePicker } from '@/components/ui/SchedulePicker'
import { SendQuoteForm } from '@/components/admin/SendQuoteForm'
import { MoreMenu, MoreActionItem } from '@/components/regional/RmTicketActions'
import { QuoteSummary, type QuoteSummaryData, type QuoteSchedule } from '@/components/workflow/QuoteSummary'
import { TicketChat } from '@/components/chat/TicketChat'
import { createClient } from '@/lib/supabase/client'
import { errMsg } from '@/components/ui/errMsg'
import { formatDateTime } from '@/lib/utils'

// Shared detail bundle for the decline pop-up's "Request details" card.
interface DeclineDetails { jobRef?: string | null; title?: string | null; storeName?: string | null; dueAt?: string | null }

async function transition(ticketId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/tickets/${ticketId}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Something went wrong')
}

// Decline the quote request (before award) — a pop-up with the request details, a
// required reason + optional note. Sets the supplier's invite to declined + notifies
// the RM. `defaultOpen` renders it straight in a modal (no trigger button).
const DECLINE_REASONS = ['Unable to meet the deadline', 'Outside our service area', 'Work is outside our expertise', 'No availability', 'Insufficient information', 'Other (please specify)']
const MAX_DECLINE_NOTE = 250
export function DeclineWorkButton({ ticketId, jobRef, title, storeName, dueAt, defaultOpen = false, onClose }: { ticketId: string; defaultOpen?: boolean; onClose?: () => void } & DeclineDetails) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const close = () => { setOpen(false); onClose?.() }
  const input = 'w-full px-3 py-2.5 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)]'

  async function submit() {
    if (!reason) { setErr('Choose a reason for declining.'); return }
    // Note is optional context appended to the required reason.
    const finalReason = [reason, note.trim()].filter(Boolean).join(' — ')
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/supplier/decline-work', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId, reason: finalReason }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      close(); router.refresh()
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  const detailTitle = [title, storeName].filter(Boolean).join(' – ') || 'Quote request'
  return (
    <>
      {!defaultOpen && <button type="button" onClick={() => setOpen(true)} className="w-full py-2.5 rounded-lg ring-1 ring-red-500/40 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-500/10 transition">Decline work</button>}
      {open && (
        <Modal onClose={() => { if (!busy) close() }} maxWidth="max-w-3xl">
          {dismiss => (
            <>
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400"><XCircle size={22} /></span>
                  <h3 className="text-xl font-bold text-[var(--text)]">Decline quote request?</h3>
                </span>
                <button type="button" onClick={dismiss} aria-label="Close" className="shrink-0 -m-1 rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"><X size={20} /></button>
              </div>
              <div className="space-y-0.5 text-sm text-[var(--text-muted)]">
                <p>The regional manager will be notified and this request may be sent to other suppliers.</p>
                <p>You will no longer be able to submit a quote unless you are invited again.</p>
              </div>

              {/* Request details */}
              <div className="rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-faint)]"><FileText size={18} /></span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Request details</p>
                    <p className="text-base font-bold text-[var(--text)]">{detailTitle}</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-muted)]">
                      {jobRef && <span className="inline-flex items-center gap-1.5"><Ticket size={13} /> TICKET: <span className="font-medium text-[var(--text)]">{jobRef}</span></span>}
                      {dueAt && <span className="inline-flex items-center gap-1.5"><Calendar size={13} /> DUE DATE: <span className="font-medium text-[var(--text)]">{formatDateTime(dueAt)}</span></span>}
                      {storeName && <span className="inline-flex items-center gap-1.5"><MapPin size={13} /> LOCATION: <span className="font-medium text-[var(--text)]">{storeName}</span></span>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Reason for declining <span className="text-red-500">*</span></label>
                  <select autoFocus className={input} value={reason} onChange={e => { setReason(e.target.value); setErr('') }}>
                    <option value="">— Select a reason —</option>
                    {DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Please provide more details</label>
                    <div className="relative">
                      <textarea maxLength={MAX_DECLINE_NOTE} className={`${input} min-h-[100px] pb-7`} placeholder="Add details (optional)" value={note} onChange={e => setNote(e.target.value.slice(0, MAX_DECLINE_NOTE))} />
                      <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] tabular-nums text-[var(--text-faint)]">{note.length} / {MAX_DECLINE_NOTE}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/25 px-3.5 py-3">
                    <Info size={15} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                    <p className="text-sm text-[var(--text-muted)]">Declining helps us route work to available suppliers. Thank you for your response.</p>
                  </div>
                </div>
              </div>

              {err && <p className="text-xs text-red-500">{err}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={dismiss} disabled={busy} className="flex-1 py-2.5 rounded-lg ring-1 ring-[var(--border)] text-[var(--text)] text-sm font-medium transition hover:bg-[var(--hover)] disabled:opacity-50">Cancel</button>
                <button type="button" onClick={submit} disabled={busy} className="flex flex-1 items-center justify-center gap-2 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-50"><XCircle size={16} /> {busy ? 'Declining…' : 'Decline request'}</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  )
}

// Quote-phase action bar (mirrors the RM's): a primary "Upload Quote" button + a
// "More" dropdown holding the secondary actions (Decline work). The action modals
// render as siblings driven by lifted state, so they open instantly.
export function SupplierQuoteBar({ ticketId, priority, createdAt, canDecline = false, decline }: { ticketId: string; priority: string; createdAt: string; canDecline?: boolean; decline?: DeclineDetails }) {
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setQuoteOpen(true)} className={`${canDecline ? 'flex-1' : 'w-full'} py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition`}>Upload Quote</button>
        {canDecline && (
          <MoreMenu align="left">
            <MoreActionItem icon={<XCircle size={16} />} label="Decline work" tone="danger" onClick={() => setDeclineOpen(true)} />
          </MoreMenu>
        )}
      </div>
      {quoteOpen && (
        <Modal onClose={() => setQuoteOpen(false)} maxWidth="max-w-3xl">
          {close => <div><SendQuoteForm defaultOpen competitive ticketId={ticketId} priority={priority} createdAt={createdAt} onClose={close} /></div>}
        </Modal>
      )}
      {declineOpen && <DeclineWorkButton ticketId={ticketId} defaultOpen onClose={() => setDeclineOpen(false)} {...decline} />}
    </>
  )
}

// Quote-submitted "Next action" actions: a primary "View my quotes" + a "More"
// dropdown holding Decline work (the supplier can still opt out after quoting).
export function SupplierQuoteSubmittedActions({ ticketId, canDecline = false, decline, quote, schedule }: { ticketId: string; canDecline?: boolean; decline?: DeclineDetails; quote?: QuoteSummaryData | null; schedule?: QuoteSchedule | null }) {
  const [declineOpen, setDeclineOpen] = useState(false)
  const [quoteOpen, setQuoteOpen] = useState(false)
  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setQuoteOpen(true)} className={`${canDecline ? 'flex-1' : 'w-full'} inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/50 transition hover:bg-blue-500/10`}>View my quote <ArrowRight size={15} /></button>
        {canDecline && (
          <MoreMenu align="left">
            <MoreActionItem icon={<XCircle size={16} />} label="Decline work" tone="danger" onClick={() => setDeclineOpen(true)} />
          </MoreMenu>
        )}
      </div>
      {quoteOpen && quote && (
        <Modal onClose={() => setQuoteOpen(false)} maxWidth="max-w-4xl">
          {() => <QuoteSummary quote={quote} status="pending" title="Your submitted quote" schedule={schedule} ticketId={ticketId} />}
        </Modal>
      )}
      {declineOpen && <DeclineWorkButton ticketId={ticketId} defaultOpen onClose={() => setDeclineOpen(false)} {...decline} />}
    </>
  )
}


// Accept a raised snag and schedule when the corrective work will happen — opens
// the same themed calendar as Schedule job (no technician step).
export function AcceptSnagCard({ ticketId, priority, createdAt }: { ticketId: string; priority: string; createdAt: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function doAccept(iso: string) {
    setBusy(true); setErr('')
    // Close the pop-up on success — router.refresh() doesn't reset client state,
    // so without this the modal sits on "Scheduling…" forever.
    try { await transition(ticketId, { action: 'accept_snag', scheduledAt: iso }); setOpen(false); setBusy(false); router.refresh() }
    catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition flex items-center justify-center gap-1.5">
        <Calendar size={15} /> Accept snag &amp; schedule fix
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-2xl">
          {close => (
            <>
              <DrawerHeader onClose={close} title={<p className="font-semibold text-[var(--text)]">Schedule the snag fix</p>} />
              {err && <p className="text-xs text-red-500">{err}</p>}
              <SchedulePicker priority={priority} createdAt={createdAt} busy={busy} onConfirm={doAccept} onCancel={close} />
            </>
          )}
        </Modal>
      )}
    </>
  )
}

// Re-propose the snag-fix time after the RM declined the proposal — shows the
// declined date + reason, then the same themed calendar. Re-proposes via
// accept_snag (the API re-proposes on 'open' snags). More → chat with the client.
export function SnagRescheduleCta({ ticketId, priority, createdAt, declinedProposedAt, declineReason, className }: { ticketId: string; priority: string; createdAt: string; declinedProposedAt: string | null; declineReason: string | null; className?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function doPropose(iso: string) {
    setBusy(true); setErr('')
    // Close on success — router.refresh() alone leaves the modal on "Scheduling…".
    try { await transition(ticketId, { action: 'accept_snag', scheduledAt: iso }); setOpen(false); setBusy(false); router.refresh() }
    catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={className ?? 'w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition flex items-center justify-center gap-1.5'}>
        <Calendar size={15} /> Re-schedule
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-2xl">
          {close => (
            <>
              <DrawerHeader onClose={close} title={<p className="font-semibold text-[var(--text)]">Schedule declined — pick a new time</p>} />
              {/* What the RM turned down, so the supplier picks a better slot. */}
              {(declinedProposedAt || declineReason) && (
                <div className="rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 p-3 space-y-0.5">
                  {declinedProposedAt && <p className="text-sm text-[var(--text-muted)]">Proposed: <span className="font-semibold text-[var(--text)]">{formatDateTime(declinedProposedAt)}</span></p>}
                  {declineReason && <p className="text-sm text-[var(--text-muted)]">Reason: <span className="font-medium text-[var(--text)]">{declineReason}</span></p>}
                </div>
              )}
              {err && <p className="text-xs text-red-500">{err}</p>}
              <SchedulePicker priority={priority} createdAt={createdAt} busy={busy} onConfirm={doPropose} onCancel={close} />
              {/* Sits under the picker's confirm row; `up` keeps the menu inside the sheet. */}
              <div className="flex justify-end">
                <MoreMenu up align="right">
                  <MoreActionItem icon={<MessageSquare size={16} />} label="Chat with the client" onClick={() => setChatOpen(true)} />
                </MoreMenu>
              </div>
            </>
          )}
        </Modal>
      )}
      {/* RM↔supplier chat, opened from More → Chat with the client (stacks over the picker). */}
      {chatOpen && <TicketChat ticketId={ticketId} viewerRole="supplier" defaultOpen onClose={() => setChatOpen(false)} />}
    </>
  )
}

// Assign a technician to the job — UI only for now (selection isn't persisted yet).
export function AssignTechnicianButton({ technicians = [] }: { technicians?: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false)
  const [techId, setTechId] = useState('')
  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full py-2.5 rounded-lg ring-1 ring-[var(--border)] text-[var(--text)] text-sm font-semibold hover:bg-[var(--hover)] transition flex items-center justify-center gap-1.5">
        <Wrench size={15} /> Assign technician
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-sm">
          {close => (
            <>
              <DrawerHeader onClose={close} title={<p className="font-semibold text-[var(--text)]">Assign a technician</p>} />
              {technicians.length ? (
                <select value={techId} onChange={e => setTechId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm outline-none focus:ring-emerald-500/40">
                  <option value="">— Select a technician —</option>
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">No technicians yet — add them under the <span className="text-blue-600 dark:text-blue-400">Technicians</span> tab.</p>
              )}
              <div className="flex gap-2">
                <button disabled={!techId} onClick={close} className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">Assign</button>
                <button onClick={close} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  )
}

// Mark the job in progress (start_work) — the first step after the quote is
// approved. Asks for an in-app confirmation before firing.
export function MarkInProgressButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState(false)
  async function go() {
    setBusy(true); setErr('')
    try { await transition(ticketId, { action: 'start_work' }); router.refresh() }
    catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  if (confirm) {
    return (
      <div className="rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] p-3 space-y-2">
        <p className="text-sm text-[var(--text)]">Mark this job as in progress? The store will see that the work has started.</p>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-2">
          <button onClick={go} disabled={busy} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Starting…' : 'Yes, mark in progress'}</button>
          <button onClick={() => { setConfirm(false); setErr('') }} disabled={busy} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Cancel</button>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-[var(--text-muted)]">
        Mark the ticket in progress when you&apos;re ready to start the job, or once the scheduled time has arrived. This lets the store know you&apos;re on your way or busy with the work.
      </p>
      <button onClick={() => setConfirm(true)} className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition flex items-center justify-center gap-1.5">
        <PlayCircle size={15} /> Mark in progress
      </button>
    </div>
  )
}

// Variation-order gate for the close-out phase (approved_closeout / vo_declined):
// AFTER the COC/POC is approved, the supplier can raise a variation order for extra
// work — otherwise the RM does the final close-out. On vo_declined it leads with the
// RM's decline reason and lets the supplier re-submit a revised VO.
export function SupplierVariationGate({ ticketId, priority, createdAt, variationCount, status, declineReason, noVosConfirmed = false }: {
  ticketId: string; priority: string; createdAt: string; variationCount: number
  status: 'approved_closeout' | 'vo_declined'; declineReason?: string | null; noVosConfirmed?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [voOpen, setVoOpen] = useState(false)
  const hasVOs = variationCount > 0 || status === 'vo_declined'
  const raiseLabel = status === 'vo_declined' ? 'Re-submit variation order' : hasVOs ? 'Raise another variation order' : 'Raise variation order'

  async function confirmNoVos() {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/supplier/ticket-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId, action: 'confirm_no_vos' }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      router.refresh()
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  // Once confirmed, the VO options are locked and the RM can close out.
  if (noVosConfirmed) {
    return <div className="rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3.5 text-sm text-[var(--text-muted)]">You confirmed there are no further variation orders. Awaiting the manager&apos;s final close-out.</div>
  }

  return (
    <div className="space-y-3">
      {/* Only the vo_declined callout stays here; the "your COC & POC were approved…"
          line lives in the Next-action sub-heading, so it isn't said twice. */}
      {status === 'vo_declined' && (
        <div className="rounded-xl bg-red-500/10 ring-1 ring-red-500/30 p-3.5 space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Variation order declined</p>
          <p className="text-sm text-[var(--text)]">{declineReason || 'The regional manager declined your variation order.'}</p>
          <p className="text-sm text-[var(--text-muted)]">Submit a revised variation order, or confirm there are none so the manager can close out.</p>
        </div>
      )}
      {/* Primary = confirm no further VOs (ready for close-out); raising a VO lives
          under "More" like the other action blocks. */}
      <div className="flex items-center gap-2">
        <button onClick={confirmNoVos} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-50">{busy ? 'Confirming…' : 'Ready for Close-out'}</button>
        <MoreMenu align="left">
          <MoreActionItem icon={<Plus size={16} />} label={raiseLabel} onClick={() => setVoOpen(true)} />
        </MoreMenu>
      </div>
      <p className="text-[11px] text-[var(--text-faint)]">To raise a variation order, tap <span className="font-semibold text-[var(--text-muted)]">More → Raise VO</span>.</p>
      {voOpen && (
        <Modal onClose={() => setVoOpen(false)} maxWidth="max-w-2xl">
          {close => <div><SendQuoteForm ticketId={ticketId} variant="variation" competitive priority={priority} createdAt={createdAt} defaultOpen onClose={close} /></div>}
        </Modal>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  )
}

// Start the snag fix — only shown once the RM has approved the proposed date.
export function StartSnagButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function go() {
    setBusy(true); setErr('')
    try { await transition(ticketId, { action: 'start_snag' }); router.refresh() }
    catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  return (
    <>
      <button onClick={go} disabled={busy} className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition disabled:opacity-50">{busy ? 'Starting…' : 'Start snag fix (in progress)'}</button>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </>
  )
}

export function ScheduleJobCard({ ticketId, priority, createdAt, technicians = [] }: { ticketId: string; priority: string; createdAt: string; technicians?: { id: string; name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [techId, setTechId] = useState('')
  // Held date/time awaiting an in-app "schedule without a technician?" confirm.
  const [pendingIso, setPendingIso] = useState<string | null>(null)

  async function doSchedule(iso: string) {
    setBusy(true); setErr('')
    // Close on success (same stuck-"Scheduling…" trap as AcceptSnagCard).
    try { await transition(ticketId, { action: 'schedule', scheduledAt: iso, technicianId: techId || null }); setOpen(false); setPendingIso(null); setBusy(false); router.refresh() }
    catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  function confirm(iso: string) {
    // Date + time are enforced by the picker; the technician is optional — ask
    // for an in-app confirmation (no browser popup) if left unassigned.
    if (!techId) { setErr(''); setPendingIso(iso); return }
    doSchedule(iso)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition flex items-center justify-center gap-1.5">
        <Calendar size={15} /> Schedule job
      </button>
      {open && (
        <Modal onClose={() => { setOpen(false); setPendingIso(null) }} maxWidth="max-w-2xl">
          {close => (
            <>
              <DrawerHeader onClose={close} title={<p className="font-semibold text-[var(--text)]">Schedule the job</p>} />
              {pendingIso ? (
                <div className="space-y-2">
                  <p className="text-sm text-[var(--text)]">No technician is assigned for this job. Schedule without one?</p>
                  {err && <p className="text-xs text-red-500">{err}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => doSchedule(pendingIso)} disabled={busy} className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50">{busy ? 'Scheduling…' : 'Yes, schedule'}</button>
                    <button onClick={() => setPendingIso(null)} disabled={busy} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Back</button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Assign a technician (from your roster) */}
                  <div>
                    <label className="block text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Technician</label>
                    {technicians.length ? (
                      <select value={techId} onChange={e => setTechId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm outline-none focus:ring-emerald-500/40">
                        <option value="">— Unassigned —</option>
                        {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    ) : (
                      <p className="text-xs text-[var(--text-muted)]">No technicians yet — add them under the <span className="text-blue-600 dark:text-blue-400">Technicians</span> tab.</p>
                    )}
                  </div>
                  {err && <p className="text-xs text-red-500">{err}</p>}
                  <SchedulePicker priority={priority} createdAt={createdAt} busy={busy} onConfirm={confirm} onCancel={close} />
                </>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  )
}
