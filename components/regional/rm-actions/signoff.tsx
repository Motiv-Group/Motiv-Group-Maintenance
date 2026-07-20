'use client'

// Sign-off / completion review actions: COC & POC review panels, variation-order
// review, approve-sign-off and snag-schedule cards.
import { useState, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, ChevronRight, MessageSquare, ClipboardCheck, Image as ImageIcon, CheckCircle2, AlertTriangle } from 'lucide-react'
import { PhotoThumbs } from '@/components/ui/PhotoThumbs'
import { TicketChat } from '@/components/chat/TicketChat'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { formatDateTime, formatCurrency } from '@/lib/utils'
import { Modal } from './modal'
import { post, errMsg } from './shared'
import { MoreMenu, MoreActionItem, RequestEvidenceButton, RaiseSnagButton } from './ticket'

// ── Generic review panel (COC/POC · snag · VO) — mirrors the quote panel ─────
// A compact clickable summary row in the "Next action" block that pops up the
// full detail + the action buttons (composed on the server and passed in as
// `body`). Same look as RmQuotePanel so every pending decision reads the same.
export function RmReviewPanel({ heading, items }: {
  heading?: string
  items: { id: string; dot: string; title: string; subtitle?: string | null; statusLabel: string; statusCls: string; modalTitle?: string; body: ReactNode }[]
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const active = items.find(i => i.id === openId) ?? null
  if (!items.length) return null
  return (
    <div className="space-y-2">
      {heading && <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{heading}</p>}
      <div className="divide-y divide-[var(--border)]">
        {items.map(it => (
          <button key={it.id} type="button" onClick={() => setOpenId(it.id)} className="w-full py-2 flex items-center justify-between gap-2 text-left transition hover:bg-[var(--hover)]">
            <span className="flex items-center gap-2 min-w-0">
              <i className={`w-2.5 h-2.5 rounded-full shrink-0 ${it.dot}`} />
              <span className="min-w-0">
                <span className="block truncate text-sm text-[var(--text)]">{it.title}</span>
                {it.subtitle && <span className="text-[11px] text-[var(--text-faint)]">{it.subtitle}</span>}
              </span>
            </span>
            <span className={`flex items-center gap-1.5 shrink-0 text-[11px] font-semibold ${it.statusCls}`}>{it.statusLabel} <FileText size={13} /></span>
          </button>
        ))}
      </div>
      {active && (
        <Modal title={active.modalTitle ?? active.title} maxWidth="max-w-3xl" onClose={() => setOpenId(null)}>
          {active.body}
        </Modal>
      )}
    </div>
  )
}

// ── RM completion review (COC & POC submitted) — inline "Next action" block ──
// A tap-to-review summary of the submission (photo/document/note counts) that
// opens the full "Sign off completion" pop-up (photos · COC · notes +
// approve/more), plus an "Approve completion" button (same pop-up) and a "More"
// menu holding Raise snag / Request more evidence / Chat with supplier.
export function RmCompletionReview({ ticketId, label, submittedAt, photoCount, docCount, noteCount, beforeUrls, afterUrls, cocUrl, invoiceUrl, notes }: {
  ticketId: string; label: string; submittedAt: string; photoCount: number; docCount: number; noteCount: number
  beforeUrls: string[]; afterUrls: string[]; cocUrl: string | null; invoiceUrl: string | null; notes: string | null
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<'evidence' | 'snag' | 'chat' | null>(null)
  const done = () => setActive(null)
  const submission: SignoffSubmission = { id: '', label, createdAt: submittedAt, beforeUrls, afterUrls, cocUrl, invoiceUrl, notes }
  return (
    <div className="space-y-3">
      {/* Tap the summary to open the full submission for review + sign-off. */}
      <button type="button" onClick={() => setOpen(true)} className="w-full rounded-lg bg-[var(--surface)] p-4 text-left ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-500/15 text-blue-500"><ClipboardCheck size={16} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[var(--text)]">{label}</span>
            <span className="block text-[11px] text-[var(--text-faint)]">Submitted {formatDateTime(submittedAt)}</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-[var(--text-faint)]" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[var(--text-muted)] sm:gap-x-6">
          <span className="flex items-center gap-1.5"><ImageIcon size={15} className="text-[var(--text-faint)]" /> <span className="font-semibold text-[var(--text)]">{photoCount}</span> Photo{photoCount === 1 ? '' : 's'}</span>
          <span className="flex items-center gap-1.5"><FileText size={15} className="text-[var(--text-faint)]" /> <span className="font-semibold text-[var(--text)]">{docCount}</span> Document{docCount === 1 ? '' : 's'}</span>
          <span className="flex items-center gap-1.5"><MessageSquare size={15} className="text-[var(--text-faint)]" /> <span className="font-semibold text-[var(--text)]">{noteCount}</span> Note{noteCount === 1 ? '' : 's'}</span>
        </div>
      </button>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"><CheckCircle2 size={16} /> Approve completion</button>
        <MoreMenu align="left">
          <MoreActionItem icon={<MessageSquare size={16} />} label="Chat with supplier" onClick={() => setActive('chat')} />
          <MoreActionItem icon={<AlertTriangle size={16} />} label="Raise snag" onClick={() => setActive('snag')} />
          <MoreActionItem icon={<MessageSquare size={16} />} label="Request more evidence" onClick={() => setActive('evidence')} />
        </MoreMenu>
      </div>

      {open && (
        <Modal title="Sign off completion" maxWidth="max-w-3xl" onClose={() => setOpen(false)}>
          <SignoffReviewPanel ticketId={ticketId} s={submission} onDone={() => setOpen(false)} />
        </Modal>
      )}
      {active === 'evidence' && <RequestEvidenceButton ticketId={ticketId} defaultOpen onClose={done} />}
      {active === 'snag' && <RaiseSnagButton ticketId={ticketId} defaultOpen onClose={done} />}
      {/* A submitted completion means the supplier is awarded, so chat is available. */}
      {active === 'chat' && <TicketChat ticketId={ticketId} viewerRole="regional_manager" defaultOpen onClose={done} />}
    </div>
  )
}

// Today-queue "Sign off" pop-up: fetches the submission currently under review
// and shows it + Accept COC/POC / Request evidence / Raise snag in place, so the
// RM can sign off from the queue without navigating into the ticket.
type SignoffSubmission = { id: string; label: string; createdAt: string; beforeUrls: string[]; afterUrls: string[]; cocUrl: string | null; invoiceUrl: string | null; notes: string | null }

export function SignoffReviewButton({ ticketId, trigger }: { ticketId: string; trigger: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ submission: SignoffSubmission | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) return
    let live = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets fetch state when the pop-up opens, before the async load; cannot run during render
    setLoading(true); setErr('')
    fetch(`/api/tickets/${ticketId}/signoff`)
      .then(r => r.json())
      .then(d => { if (!live) return; if (d?.error) setErr(d.error); else setData(d) })
      .catch(() => { if (live) setErr('Could not load the submission.') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [open, ticketId])
  return (
    <>
      {trigger(() => setOpen(true))}
      {open && (
        <Modal title="Sign off completion" maxWidth="max-w-3xl" onClose={() => setOpen(false)}>
          {loading ? <p className="py-4 text-center text-sm text-[var(--text-faint)]">Loading…</p>
            : err ? <p className="text-sm text-red-500">{err}</p>
            : data?.submission ? <SignoffReviewPanel ticketId={ticketId} s={data.submission} onDone={() => setOpen(false)} />
            : <p className="text-sm text-[var(--text-faint)]">Nothing awaiting your sign-off on this ticket.</p>}
        </Modal>
      )}
    </>
  )
}

// Best-effort filename from a (possibly signed) storage URL.
function docName(url: string, fallback: string): string {
  try {
    const raw = decodeURIComponent((url.split('?')[0].split('/').pop() || '').trim())
    return raw.replace(/^\d{6,}-[a-z0-9]{4,}-/i, '') || fallback
  } catch { return fallback }
}

const REVIEW_LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]'

// A document row (COC / invoice): PDF icon + filename + uploaded time, with a
// "View …" link on the right.
function DocRow({ ticketId, url, itemType, itemLabel, uploadedAt, viewLabel }: {
  ticketId: string; url: string; itemType: 'coc' | 'invoice'; itemLabel: string; uploadedAt: string; viewLabel: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--surface-2)] p-3 ring-1 ring-[var(--border)]">
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-red-500/15 text-red-600 dark:text-red-400"><FileText size={18} /></span>
        <span className="min-w-0">
          {/* Wraps to two lines on phones so the filename stays readable. */}
          <span className="line-clamp-2 break-all text-sm font-semibold text-[var(--text)] sm:line-clamp-none sm:block sm:truncate">{docName(url, itemLabel)}</span>
          <span className="block text-[11px] text-[var(--text-faint)]">Uploaded {formatDateTime(uploadedAt)}</span>
        </span>
      </span>
      <ViewTrackedLink ticketId={ticketId} itemType={itemType} itemLabel={itemLabel} href={url} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-blue-600 transition hover:underline dark:text-blue-400">{viewLabel} <ChevronRight size={15} /></ViewTrackedLink>
    </div>
  )
}

// The rich "Sign off completion" review panel — used in BOTH the RM ticket's
// Next-action pop-up and the Today-queue sign-off pop-up. Shows the full
// submission (photos · COC · notes) with "Approve completion" and a "More"
// menu (Chat with supplier / Request more evidence / Raise a snag).
// The supplier rating moved to the final close-out (CloseOutButton).
export function SignoffReviewPanel({ ticketId, s, onDone }: { ticketId: string; s: SignoffSubmission; onDone?: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sub, setSub] = useState<'evidence' | 'snag' | 'chat' | null>(null)
  const photos = [...s.beforeUrls, ...s.afterUrls]
  const closeSub = () => setSub(null)

  async function approve() {
    setBusy(true); setErr('')
    try {
      await post(`/api/tickets/${ticketId}/transition`, { action: 'approve' })
      onDone?.(); router.refresh()
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {/* Submission detail — photos / COC / notes, each under its own rule. */}
      <div className="overflow-hidden rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-[var(--border)] px-4 py-3">
          <FileText size={16} className="shrink-0 text-blue-500" />
          <span className="text-sm font-bold text-[var(--text)]">{s.label}</span>
          <span className="text-[var(--text-faint)]">·</span>
          <span className="text-[13px] text-[var(--text-faint)]">{formatDateTime(s.createdAt)}</span>
        </div>
        <div className="space-y-4 p-4">
          <div>
            <div className={REVIEW_LABEL}>Proof of completion</div>
            <div className="mt-2">
              {photos.length ? <PhotoThumbs urls={photos} ticketId={ticketId} label="Completion photo" limit={4} /> : <span className="text-sm text-[var(--text-faint)]">No photos</span>}
            </div>
          </div>
          <div className="border-t border-[var(--border)] pt-4">
            <div className={REVIEW_LABEL}>Certificate of completion</div>
            <div className="mt-2 space-y-2">
              {s.cocUrl ? <DocRow ticketId={ticketId} url={s.cocUrl} itemType="coc" itemLabel="COC" uploadedAt={s.createdAt} viewLabel="View COC" /> : <span className="text-sm text-[var(--text-faint)]">No certificate uploaded</span>}
              {s.invoiceUrl && <DocRow ticketId={ticketId} url={s.invoiceUrl} itemType="invoice" itemLabel="Invoice" uploadedAt={s.createdAt} viewLabel="View invoice" />}
            </div>
          </div>
          <div className="border-t border-[var(--border)] pt-4">
            <div className={REVIEW_LABEL}>Notes</div>
            {s.notes?.trim() ? <p className="mt-1 text-sm text-[var(--text-muted)] whitespace-pre-line">{s.notes}</p> : <span className="text-sm text-[var(--text-faint)]">No notes added</span>}
          </div>
        </div>
      </div>

      {err && <p className="text-xs text-red-500">{err}</p>}

      <div className="flex items-center gap-2">
        <button onClick={approve} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"><CheckCircle2 size={16} /> {busy ? 'Approving…' : 'Approve completion'}</button>
        <MoreMenu up align="right">
          <MoreActionItem icon={<MessageSquare size={16} />} label="Chat with supplier" onClick={() => setSub('chat')} />
          <MoreActionItem icon={<MessageSquare size={16} />} label="Request more evidence" onClick={() => setSub('evidence')} />
          <MoreActionItem icon={<AlertTriangle size={16} />} label="Raise a snag" tone="danger" onClick={() => setSub('snag')} />
        </MoreMenu>
      </div>

      {sub === 'evidence' && <RequestEvidenceButton ticketId={ticketId} defaultOpen onClose={closeSub} />}
      {sub === 'snag' && <RaiseSnagButton ticketId={ticketId} defaultOpen onClose={closeSub} />}
      {/* A submitted sign-off means the supplier is already awarded, so chat is always available here. */}
      {sub === 'chat' && <TicketChat ticketId={ticketId} viewerRole="regional_manager" defaultOpen onClose={closeSub} />}
    </div>
  )
}

// ── Variation order review (approve / decline) ──────────────────
const VO_DECLINE_REASONS = ['Cost too high', 'Not budgeted', 'Outside agreed scope', 'Needs more detail / justification', 'Obtain another quote', 'Other']
export function VariationReviewCard({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmApprove, setConfirmApprove] = useState(false)   // approve confirm sits over the buttons
  const [declineOpen, setDeclineOpen] = useState(false)         // decline is a pop-up
  const [reason, setReason] = useState('')
  const [other, setOther] = useState('')
  const [err, setErr] = useState('')
  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'

  async function act(action: 'approve_variation' | 'reject_variation', reasonText?: string) {
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action, reason: reasonText }); router.refresh() }
    catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  function submitDecline() {
    if (!reason) { setErr('Choose a reason.'); return }
    const r = reason === 'Other' ? other.trim() : reason
    if (!r) { setErr('Enter a reason.'); return }
    act('reject_variation', r)
  }

  return (
    <div className="space-y-2">
      {confirmApprove ? (
        // "Are you sure?" replaces the buttons in place (no separate row).
        <div className="rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] p-3 space-y-2">
          <p className="text-sm text-[var(--text)]">Are you sure you want to approve the variation order?</p>
          <div className="flex gap-2">
            <button onClick={() => act('approve_variation')} disabled={busy} className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Approving…' : 'Yes, approve'}</button>
            <button onClick={() => setConfirmApprove(false)} disabled={busy} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Cancel</button>
          </div>
        </div>
      ) : (
        // Stack on phones — side by side both labels wrap to two lines at 375px.
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={() => { setErr(''); setConfirmApprove(true) }} className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition">Approve variation order</button>
          <button onClick={() => { setReason(''); setOther(''); setErr(''); setDeclineOpen(true) }} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition">Decline variation order</button>
        </div>
      )}
      {err && !declineOpen && <p className="text-xs text-red-500">{err}</p>}

      {declineOpen && (
        <Modal title="Decline variation order" onClose={() => { if (!busy) { setDeclineOpen(false); setErr('') } }}>
          <p className="text-xs text-[var(--text-muted)]">The supplier is notified. Choose why the variation order is declined.</p>
          <select autoFocus className={input} value={reason} onChange={e => { setReason(e.target.value); setErr('') }}>
            <option value="">— Choose a reason —</option>
            {VO_DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {reason === 'Other' && <textarea className={`${input} min-h-[80px]`} placeholder="Reason…" value={other} onChange={e => setOther(e.target.value)} />}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={submitDecline} disabled={busy} className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Declining…' : 'Decline variation order'}</button>
            <button onClick={() => { setDeclineOpen(false); setErr('') }} disabled={busy} className="flex-1 py-2 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── View & Approve a variation order (Today queue pop-up) ───────
// Fetches the pending VO on open (description · amount · warranty · attachments)
// and shows it above the approve/decline controls — the queue equivalent of the
// RM detail page's variation block. RM-scoped GET (see /variation route).
type PendingVo = { id: string; description: string; amount: number | null; warranty: string | null; file_urls: string[]; created_at: string }
export function VariationReviewButton({ ticketId, trigger }: { ticketId: string; trigger: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const [vo, setVo] = useState<PendingVo | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) return
    let live = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets fetch state when the pop-up opens, before the async load
    setLoading(true); setErr(''); setVo(null)
    fetch(`/api/tickets/${ticketId}/variation`)
      .then(r => r.json())
      .then(d => { if (!live) return; if (d?.error) setErr(d.error); else setVo(d.variation) })
      .catch(() => { if (live) setErr('Could not load the variation order.') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [open, ticketId])
  return (
    <>
      {trigger(() => setOpen(true))}
      {open && (
        <Modal title="Variation order" maxWidth="max-w-2xl" onClose={() => setOpen(false)}>
          {loading ? <p className="py-4 text-center text-sm text-[var(--text-faint)]">Loading…</p>
            : err ? <p className="text-sm text-red-500">{err}</p>
            : !vo ? <p className="py-4 text-center text-sm text-[var(--text-faint)]">No variation order awaiting review.</p>
            : (
              <div className="space-y-4">
                <div className="space-y-2 rounded-xl bg-[var(--surface-2)] p-4 ring-1 ring-[var(--border)]">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Extra work requested</p>
                    {vo.amount != null && <p className="shrink-0 text-lg font-bold tabular-nums text-[var(--text)]">{formatCurrency(vo.amount)}</p>}
                  </div>
                  <p className="whitespace-pre-line text-sm text-[var(--text)]">{vo.description}</p>
                  {vo.warranty && <p className="text-[13px] text-[var(--text-muted)]"><span className="font-semibold text-[var(--text)]">Warranty:</span> {vo.warranty}</p>}
                  {vo.file_urls.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {vo.file_urls.map((u, i) => (
                        <ViewTrackedLink key={i} ticketId={ticketId} itemType="attachment" itemLabel={`Variation order attachment ${i + 1}`} href={u}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface)] px-2.5 py-1.5 text-[13px] font-medium text-blue-600 ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] dark:text-blue-400">
                          <FileText size={14} /> Attachment {i + 1}
                        </ViewTrackedLink>
                      ))}
                    </div>
                  )}
                </div>
                <VariationReviewCard ticketId={ticketId} />
              </div>
            )}
        </Modal>
      )}
    </>
  )
}

// ── Approve sign-off ────────────────────────────────────────────
// The supplier rating moved to the final close-out (CloseOutButton).
export function ApproveSignoffCard({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function approve() {
    setBusy(true); setErr('')
    try {
      await post(`/api/tickets/${ticketId}/transition`, { action: 'approve' })
      router.refresh()
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <div className="rounded-xl ring-1 ring-[var(--border)] p-4 space-y-3">
      <p className="text-sm font-semibold text-[var(--text)]">Accept the COC &amp; POC to approve the completion</p>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <button onClick={approve} disabled={busy} className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Submitting…' : 'Accept COC/POC'}</button>
    </div>
  )
}

// ── Approve / decline a supplier's proposed snag-fix date ───────
const SNAG_SCHEDULE_DECLINE_REASONS = ['Date is too far out', 'Needs to be done sooner', 'Outside acceptable window', 'Clashes with store operations', 'Other']
export function AcceptSnagScheduleCard({ ticketId, scheduledAt }: { ticketId: string; scheduledAt: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [declineOpen, setDeclineOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [other, setOther] = useState('')
  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'

  async function approve() {
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'approve_snag' }); router.refresh() }
    catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  async function decline() {
    if (!reason) { setErr('Choose a reason.'); return }
    const finalReason = reason === 'Other' ? other.trim() : reason
    if (!finalReason) { setErr('Tell the supplier why.'); return }
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'decline_snag_schedule', reason: finalReason }); setDeclineOpen(false); setBusy(false); router.refresh() }
    catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <div className="rounded-xl ring-1 ring-indigo-500/40 bg-indigo-500/5 p-4 space-y-2">
      <p className="text-sm font-semibold text-[var(--text)]">Snag fix schedule</p>
      <p className="text-sm text-[var(--text-muted)]">The supplier proposed <span className="font-semibold text-[var(--text)]">{formatDateTime(scheduledAt)}</span> to carry out the corrective work. Approve to confirm, or decline to ask for a new date.</p>
      {err && !declineOpen && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button onClick={approve} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Approving…' : 'Approve snag schedule'}</button>
        <button onClick={() => { setReason(''); setOther(''); setErr(''); setDeclineOpen(true) }} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50">Decline</button>
      </div>
      {declineOpen && (
        <Modal title="Decline snag schedule" onClose={() => { if (!busy) { setDeclineOpen(false); setErr('') } }}>
          <p className="text-xs text-[var(--text-muted)]">The supplier is notified and asked to propose a new date for the corrective work.</p>
          <select autoFocus className={input} value={reason} onChange={e => { setReason(e.target.value); setErr('') }}>
            <option value="">— Choose a reason —</option>
            {SNAG_SCHEDULE_DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {reason === 'Other' && <textarea className={`${input} min-h-[80px]`} placeholder="Tell the supplier why…" value={other} onChange={e => setOther(e.target.value)} />}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={decline} disabled={busy} className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Declining…' : 'Decline schedule'}</button>
            <button onClick={() => { setDeclineOpen(false); setErr('') }} disabled={busy} className="flex-1 py-2 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
