'use client'

// Sign-off / completion review actions: COC & POC review panels, variation-order
// review, approve-sign-off and snag-schedule cards.
import { useState, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, ChevronRight, MessageSquare, ClipboardCheck, Image as ImageIcon, CheckCircle2, AlertTriangle, User, Ticket, MapPin, Tag, Eye, Info, Store, CalendarClock, Wrench, XCircle, FilePlus2 } from 'lucide-react'
import { PhotoThumbs } from '@/components/ui/PhotoThumbs'
import { TicketChat } from '@/components/chat/TicketChat'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { cocLabel, invoiceLabel, completionPhotoLabel, variationAttachmentLabel } from '@/lib/attachment-labels'
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
  items: { id: string; dot: string; title: string; subtitle?: string | null; statusLabel: string; statusCls: string; modalTitle?: ReactNode; body: ReactNode }[]
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
// menu holding Request more evidence / Chat with supplier / Raise snag.
export function RmCompletionReview({ ticketId, label, submittedAt, photoCount, docCount, noteCount, beforeUrls, afterUrls, cocUrl, invoiceUrl, notes, supplierName, jobRef, storeName, category }: {
  ticketId: string; label: string; submittedAt: string; photoCount: number; docCount: number; noteCount: number
  beforeUrls: string[]; afterUrls: string[]; cocUrl: string | null; invoiceUrl: string | null; notes: string | null
  supplierName: string | null; jobRef: string | null; storeName: string | null; category: string | null
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<'evidence' | 'snag' | 'chat' | null>(null)
  const done = () => setActive(null)
  const submission: SignoffSubmission = { id: '', label, createdAt: submittedAt, beforeUrls, afterUrls, cocUrl, invoiceUrl, notes, supplierName, jobRef, storeName, category }
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
        <MoreMenu inline align="right">
          <MoreActionItem icon={<MessageSquare size={16} />} label="Request more evidence" onClick={() => setActive('evidence')} />
          <MoreActionItem icon={<MessageSquare size={16} />} label="Chat with supplier" onClick={() => setActive('chat')} />
          <MoreActionItem icon={<AlertTriangle size={16} />} label="Raise snag" tone="danger" onClick={() => setActive('snag')} />
        </MoreMenu>
      </div>

      {open && (
        <Modal title={SIGNOFF_MODAL_TITLE} maxWidth="max-w-3xl" onClose={() => setOpen(false)}>
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
type SignoffSubmission = {
  id: string; label: string; createdAt: string; beforeUrls: string[]; afterUrls: string[]; cocUrl: string | null; invoiceUrl: string | null; notes: string | null
  // Header meta — nullable; a missing value just hides its cell in the pop-up.
  supplierName: string | null; jobRef: string | null; storeName: string | null; category: string | null
}

// Shared pop-up title: green circled check + label (the Modal takes a ReactNode).
const SIGNOFF_MODAL_TITLE = (
  <span className="flex items-center gap-2.5">
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-500"><CheckCircle2 size={16} /></span>
    Sign off completion
  </span>
)

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
        <Modal title={SIGNOFF_MODAL_TITLE} maxWidth="max-w-3xl" onClose={() => setOpen(false)}>
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

// Pull the round number out of a submission label like "Submission #2" so audit
// labels can carry it; undefined when the label doesn't encode a number.
function submissionNoFrom(label?: string | null): number | undefined {
  const m = (label ?? '').match(/#\s*(\d+)/)
  return m ? parseInt(m[1], 10) : undefined
}

const REVIEW_LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]'

// A document row (COC / invoice): red PDF tile + filename + uploaded time, with
// an outlined "View …" button on the right (same tracked link as before).
function DocRow({ ticketId, url, itemType, itemLabel, fallbackName, uploadedAt, viewLabel }: {
  ticketId: string; url: string; itemType: 'coc' | 'invoice'; itemLabel: string; fallbackName: string; uploadedAt: string; viewLabel: string
}) {
  return (
    // flex-wrap: on phones the button drops to its own line instead of squeezing the name.
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--surface)] p-3 ring-1 ring-[var(--border)]">
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-red-500/15 text-red-600 dark:text-red-400"><FileText size={18} /></span>
        <span className="min-w-0">
          {/* Wraps to two lines on phones so the filename stays readable. */}
          <span className="line-clamp-2 break-all text-sm font-semibold text-[var(--text)] sm:line-clamp-none sm:block sm:truncate">{docName(url, fallbackName)}</span>
          <span className="block text-[11px] text-[var(--text-faint)]">Uploaded {formatDateTime(uploadedAt)}</span>
        </span>
      </span>
      <ViewTrackedLink ticketId={ticketId} itemType={itemType} itemLabel={itemLabel} href={url} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--text)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]"><Eye size={15} /> {viewLabel} <ChevronRight size={15} /></ViewTrackedLink>
    </div>
  )
}

// One submission-meta cell (Submitted by / Ticket / Site / Trade): tinted icon +
// tiny label over a semibold value (+ optional faint sub-line, e.g. "store ·
// trade" under a job ref). Hidden entirely when the value is missing.
function MetaCell({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string | null; sub?: string | null }) {
  if (!value) return null
  return (
    <div className="min-w-0 sm:px-4 sm:first:pl-0">
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-faint)]">{icon} {label}</span>
      <span className="mt-0.5 block truncate text-sm font-semibold text-[var(--text)]">{value}</span>
      {sub && <span className="block truncate text-[11px] text-[var(--text-faint)]">{sub}</span>}
    </div>
  )
}

// The rich "Sign off completion" review panel — used in BOTH the RM ticket's
// Next-action pop-up and the Today-queue sign-off pop-up. Shows the full
// submission (photos · COC · notes) with "Approve completion" and a "More"
// menu (Request more evidence / Chat with supplier / Raise snag).
// The supplier rating moved to the final close-out (CloseOutButton).
export function SignoffReviewPanel({ ticketId, s, onDone }: { ticketId: string; s: SignoffSubmission; onDone?: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sub, setSub] = useState<'evidence' | 'snag' | 'chat' | null>(null)
  const [allPhotos, setAllPhotos] = useState(false)   // "View all" tile expands the strip in place
  const photos = [...s.beforeUrls, ...s.afterUrls]
  const beforeCount = s.beforeUrls.length
  const submissionNo = submissionNoFrom(s.label)      // round number for audit labels (COC/invoice/photos)
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
      {/* Submission summary card — which submission, when, by whom, for what. */}
      <div className="rounded-xl bg-[var(--surface-2)] p-4 ring-1 ring-[var(--border)]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <FileText size={16} className="shrink-0 text-blue-500" />
          <span className="text-sm font-bold text-[var(--text)]">{s.label}</span>
          <span className="text-[var(--text-faint)]">·</span>
          <span className="text-[13px] text-[var(--text-faint)]">{formatDateTime(s.createdAt)}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-[var(--border)]">
          <MetaCell icon={<User size={13} className="text-blue-500" />} label="Submitted by" value={s.supplierName} />
          <MetaCell icon={<Ticket size={13} className="text-violet-500" />} label="Ticket" value={s.jobRef} />
          <MetaCell icon={<MapPin size={13} className="text-emerald-500" />} label="Site" value={s.storeName} />
          <MetaCell icon={<Tag size={13} className="text-amber-500" />} label="Trade" value={s.category} />
        </div>
      </div>

      {/* Proof of completion — before + after in one numbered strip; the dashed
          tile expands to every photo in place (lightbox + view-tracking kept). */}
      <div>
        <div className={REVIEW_LABEL}>Proof of completion ({photos.length} photo{photos.length === 1 ? '' : 's'})</div>
        <div className="mt-2">
          {photos.length
            ? <PhotoThumbs urls={photos} ticketId={ticketId} label="Completion photo" limit={allPhotos ? undefined : 5} onMore={() => setAllPhotos(true)}
                trackLabels={photos.map((_, i) => i < beforeCount
                  ? completionPhotoLabel('before', i + 1, s.supplierName, submissionNo)
                  : completionPhotoLabel('after', i - beforeCount + 1, s.supplierName, submissionNo))} />
            : <span className="text-sm text-[var(--text-faint)]">No photos</span>}
        </div>
      </div>

      <div>
        <div className={REVIEW_LABEL}>Certificate of compliance (COC)</div>
        <div className="mt-2">
          {s.cocUrl ? <DocRow ticketId={ticketId} url={s.cocUrl} itemType="coc" itemLabel={cocLabel(s.supplierName, submissionNo)} fallbackName="COC.pdf" uploadedAt={s.createdAt} viewLabel="View COC" /> : <span className="text-sm text-[var(--text-faint)]">No certificate uploaded</span>}
        </div>
      </div>

      {s.invoiceUrl && (
        <div>
          <div className={REVIEW_LABEL}>Invoice</div>
          <div className="mt-2"><DocRow ticketId={ticketId} url={s.invoiceUrl} itemType="invoice" itemLabel={invoiceLabel(s.supplierName, submissionNo)} fallbackName="Invoice.pdf" uploadedAt={s.createdAt} viewLabel="View invoice" /></div>
        </div>
      )}

      {s.notes?.trim() && (
        <div>
          <div className={REVIEW_LABEL}>Notes</div>
          <p className="mt-1 text-sm text-[var(--text-muted)] whitespace-pre-line">{s.notes}</p>
        </div>
      )}

      {/* What approving does — sits just above the buttons. */}
      <div className="flex items-start gap-2.5 rounded-xl bg-blue-500/10 p-3.5 ring-1 ring-blue-500/30">
        <Info size={16} className="mt-0.5 shrink-0 text-blue-500" />
        <p className="text-sm text-[var(--text-muted)]">Approving this submission will sign off the work and move the ticket to the next close-out step.</p>
      </div>

      {err && <p className="text-xs text-red-500">{err}</p>}

      <div className="flex items-center gap-2">
        <MoreMenu up align="left">
          <MoreActionItem icon={<MessageSquare size={16} />} label="Request more evidence" onClick={() => setSub('evidence')} />
          <MoreActionItem icon={<MessageSquare size={16} />} label="Chat with supplier" onClick={() => setSub('chat')} />
          <MoreActionItem icon={<AlertTriangle size={16} />} label="Raise snag" tone="danger" onClick={() => setSub('snag')} />
        </MoreMenu>
        <button onClick={approve} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"><CheckCircle2 size={16} /> {busy ? 'Approving…' : 'Approve completion'}</button>
      </div>

      {sub === 'evidence' && <RequestEvidenceButton ticketId={ticketId} defaultOpen onClose={closeSub} />}
      {sub === 'snag' && <RaiseSnagButton ticketId={ticketId} defaultOpen onClose={closeSub} />}
      {/* A submitted sign-off means the supplier is already awarded, so chat is always available here. */}
      {sub === 'chat' && <TicketChat ticketId={ticketId} viewerRole="regional_manager" defaultOpen onClose={closeSub} />}
    </div>
  )
}

// ── Variation order review (approve / decline) ──────────────────
// VariationReviewCard is the compact inline approve/decline pair still used by
// the individual ticket page; the RM surfaces use VariationReviewPanel below.
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

// ── RM "Review variation order" pop-up (ticket page + Today queue) ───────────
// The rich review panel shared by BOTH RM entry points: submission meta
// (supplier · ticket · submitted), the additional-scope card (description +
// amount + attachments), an info banner and Approve VO / More (Decline · Chat).
// Decline opens its own pop-up (reason select + comments) and fires the same
// reject_variation transition as before. The ticket page feeds the panel from
// the detail loader; the Today queue fetches /api/tickets/[id]/variation.
type PendingVo = {
  id: string; description: string; amount: number | null; amount_incl_vat: number | null; file_urls: string[]; created_at: string
  // Header meta — nullable; a missing value just hides its cell in the pop-up.
  supplierName: string | null; jobRef: string | null; storeName: string | null; category: string | null
}

// Pop-up titles: tinted circled icon + label (the Modal takes a ReactNode). The
// review title is a COMPONENT (not a const) so the RSC ticket page can import
// it — a plain const from a 'use client' file reads undefined in a Server Component.
export function VoReviewTitle() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400"><FilePlus2 size={16} /></span>
      Review variation order
    </span>
  )
}
const VO_DECLINE_MODAL_TITLE = (
  <span className="flex items-center gap-2.5">
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-500/15 text-red-500"><XCircle size={16} /></span>
    Decline variation order
  </span>
)

const MAX_VO_DECLINE_COMMENT = 500
const VO_IMAGE_RE = /\.(jpe?g|png|webp|heic)$/i

export function VariationReviewPanel({ ticketId, vo, onDone }: { ticketId: string; vo: PendingVo; onDone?: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'

  async function act(action: 'approve_variation' | 'reject_variation', reasonText?: string) {
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action, reason: reasonText }); onDone?.(); router.refresh() }
    catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  function submitDecline() {
    if (!reason) { setErr('Choose a reason.'); return }
    const c = comment.trim()
    if (reason === 'Other' && !c) { setErr('Add a comment explaining the reason.'); return }
    // "Other" sends the comment itself; a preset + comment composes "Preset — comment".
    act('reject_variation', reason === 'Other' ? c : c ? `${reason} — ${c}` : reason)
  }

  // Description: bold the first line when the text naturally splits into more.
  const [voFirstLine, ...voRest] = vo.description.split('\n')
  const voRestText = voRest.join('\n').trim()
  // Attachments: image files render as small thumbnails, the rest as document
  // rows. Labels keep the original file order so the view trail stays stable.
  const files = vo.file_urls.map((url, i) => ({ url, n: i + 1, isImage: VO_IMAGE_RE.test(url.split('?')[0] ?? '') }))
  const imageFiles = files.filter(f => f.isImage)
  const docFiles = files.filter(f => !f.isImage)
  const voTotal = vo.amount_incl_vat ?? vo.amount

  return (
    <div className="space-y-4">
      <p className="-mt-1 text-sm text-[var(--text-muted)]">Review the supplier&apos;s request for additional work and either approve or decline.</p>

      {/* Submission meta — who requested it, on which job, and when. */}
      <div className="rounded-xl bg-[var(--surface-2)] p-4 ring-1 ring-[var(--border)]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-[var(--border)]">
          <MetaCell icon={<Store size={13} className="text-blue-500" />} label="Supplier" value={vo.supplierName} />
          <MetaCell icon={<Ticket size={13} className="text-violet-500" />} label="Ticket" value={vo.jobRef} sub={[vo.storeName, vo.category].filter(Boolean).join(' · ') || null} />
          <MetaCell icon={<CalendarClock size={13} className="text-amber-500" />} label="Submitted" value={formatDateTime(vo.created_at)} />
        </div>
      </div>

      {/* The requested extra work — description + attachments, amount on the right. */}
      <div className="rounded-xl bg-[var(--surface-2)] p-4 ring-1 ring-[var(--border)]">
        <div className={REVIEW_LABEL}>Additional scope</div>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400"><Wrench size={18} /></span>
            <div className="min-w-0 flex-1">
              {voRestText ? (
                <>
                  <p className="text-sm font-semibold text-[var(--text)]">{voFirstLine}</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-[var(--text)]">{voRestText}</p>
                </>
              ) : (
                <p className="whitespace-pre-line text-sm text-[var(--text)]">{vo.description}</p>
              )}
              {imageFiles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {imageFiles.map(f => (
                    <ViewTrackedLink key={f.n} ticketId={ticketId} itemType="attachment" itemLabel={variationAttachmentLabel(f.n, vo.supplierName)} href={f.url} className="block h-16 w-16 overflow-hidden rounded-lg ring-1 ring-[var(--border)]">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; next/image can't optimize it */}
                      <img src={f.url} alt={`Variation order attachment ${f.n}`} loading="lazy" className="h-full w-full object-cover" />
                    </ViewTrackedLink>
                  ))}
                </div>
              )}
              {docFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {docFiles.map(f => (
                    <ViewTrackedLink key={f.n} ticketId={ticketId} itemType="attachment" itemLabel={variationAttachmentLabel(f.n, vo.supplierName)} href={f.url} className="flex items-center gap-2 rounded-lg bg-[var(--surface)] px-3 py-2 ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]">
                      <FileText size={15} className="shrink-0 text-[var(--text-faint)]" />
                      <span className="min-w-0 truncate text-[13px] font-medium text-blue-600 dark:text-blue-400">{docName(f.url, `Attachment ${f.n}`)}</span>
                    </ViewTrackedLink>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Amount — own row under the description on phones, right column from sm. */}
          <div className="shrink-0 border-t border-[var(--border)] pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
            <span className="block text-[11px] text-[var(--text-faint)]">Amount requested</span>
            <span className="mt-0.5 block text-xl font-bold tabular-nums text-[var(--text)]">{vo.amount != null ? formatCurrency(vo.amount) : '—'} <span className="text-[11px] font-medium text-[var(--text-faint)]">excl. VAT</span></span>
            {/* Old VOs predate amount_incl_vat — omit the line rather than compute VAT. */}
            {vo.amount_incl_vat != null && <span className="block text-sm font-semibold tabular-nums text-[var(--text-muted)]">{formatCurrency(vo.amount_incl_vat)} <span className="text-[11px] font-medium text-[var(--text-faint)]">incl. VAT</span></span>}
          </div>
        </div>
      </div>

      {/* What approving does — sits just above the buttons. */}
      <div className="flex items-start gap-2.5 rounded-xl bg-blue-500/10 p-3.5 ring-1 ring-blue-500/30">
        <Info size={16} className="mt-0.5 shrink-0 text-blue-500" />
        <p className="text-sm text-[var(--text-muted)]">Approving this variation order will add {voTotal != null ? formatCurrency(voTotal) : 'the requested amount'} to the job total and authorise the supplier to proceed with this additional work.</p>
      </div>

      {err && !declineOpen && <p className="text-xs text-red-500">{err}</p>}

      <div className="flex items-center gap-2">
        <MoreMenu up align="left">
          <MoreActionItem icon={<XCircle size={16} />} label="Decline variation order" tone="danger" onClick={() => { setReason(''); setComment(''); setErr(''); setDeclineOpen(true) }} />
          <MoreActionItem icon={<MessageSquare size={16} />} label="Chat with supplier" onClick={() => setChatOpen(true)} />
        </MoreMenu>
        <button onClick={() => act('approve_variation')} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"><CheckCircle2 size={16} /> {busy && !declineOpen ? 'Approving…' : 'Approve VO'}</button>
      </div>

      {declineOpen && (
        <Modal title={VO_DECLINE_MODAL_TITLE} onClose={() => { if (!busy) { setDeclineOpen(false); setErr('') } }}>
          <p className="-mt-1 text-sm text-[var(--text-muted)]">The supplier will be notified that this variation order has been declined. Please select a reason for declining.</p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Reason for declining <span className="text-red-500">*</span></label>
            <select autoFocus className={input} value={reason} onChange={e => { setReason(e.target.value); setErr('') }}>
              <option value="">— Choose a reason —</option>
              {VO_DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Comments <span className="font-normal text-[var(--text-faint)]">(required if &quot;Other&quot; is selected)</span></label>
            <div className="relative">
              <textarea maxLength={MAX_VO_DECLINE_COMMENT} className={`${input} min-h-[90px] pb-7`} placeholder="Add context for the supplier…" value={comment} onChange={e => { setComment(e.target.value.slice(0, MAX_VO_DECLINE_COMMENT)); setErr('') }} />
              <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] tabular-nums text-[var(--text-faint)]">{comment.length} / {MAX_VO_DECLINE_COMMENT}</span>
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-blue-500/10 p-3.5 ring-1 ring-blue-500/30">
            <Info size={16} className="mt-0.5 shrink-0 text-blue-500" />
            <p className="text-sm text-[var(--text-muted)]">The supplier will be notified and may submit a revised variation order.</p>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setDeclineOpen(false); setErr('') }} disabled={busy} className="px-4 py-2.5 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm font-medium disabled:opacity-50">Cancel</button>
            <button onClick={submitDecline} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Declining…' : 'Decline and notify supplier'}</button>
          </div>
        </Modal>
      )}
      {/* A VO means the supplier is already awarded, so chat is always available here. */}
      {chatOpen && <TicketChat ticketId={ticketId} viewerRole="regional_manager" defaultOpen onClose={() => setChatOpen(false)} />}
    </div>
  )
}

// ── View & Approve a variation order (Today queue pop-up) ───────
// Fetches the pending VO on open (meta · description · amounts · attachments)
// and shows the shared VariationReviewPanel — the queue equivalent of the RM
// detail page's variation pop-up. RM-scoped GET (see /variation route).
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
        <Modal title={<VoReviewTitle />} maxWidth="max-w-2xl" onClose={() => setOpen(false)}>
          {loading ? <p className="py-4 text-center text-sm text-[var(--text-faint)]">Loading…</p>
            : err ? <p className="text-sm text-red-500">{err}</p>
            : !vo ? <p className="py-4 text-center text-sm text-[var(--text-faint)]">No variation order awaiting review.</p>
            : <VariationReviewPanel ticketId={ticketId} vo={vo} onDone={() => setOpen(false)} />}
        </Modal>
      )}
    </>
  )
}

// ── VO review area (RM ticket page) — "View VO & approve" + a small "More"
// beside it holding the secondary chat entry. Mirrors CloseOutBar: the chat
// modal is a sibling driven by lifted state; the primary reuses
// VariationReviewButton so the pop-up is the SAME one as the Today queue.
// Client component (a Server Component may not pass the click handlers).
export function VoReviewBar({ ticketId }: { ticketId: string }) {
  const [chat, setChat] = useState(false)
  return (
    <>
      <div className="flex items-center gap-2">
        <MoreMenu inline up align="left">
          <MoreActionItem icon={<MessageSquare size={16} />} label="Chat with supplier" onClick={() => setChat(true)} />
        </MoreMenu>
        <VariationReviewButton ticketId={ticketId}
          trigger={open => <button type="button" onClick={open} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition">View VO &amp; approve</button>} />
      </div>
      {chat && <TicketChat ticketId={ticketId} viewerRole="regional_manager" defaultOpen onClose={() => setChat(false)} />}
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
