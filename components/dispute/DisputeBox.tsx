'use client'

// Supplier↔RM dispute thread over a snag or a "more evidence" request. The supplier
// raises it (pausing the snag/evidence step); both sides post messages + evidence in
// a free-flowing numbered thread until the RM resolves it as upheld or withdrawn.
import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { uploadOne } from '@/lib/upload'
import type { ReactNode } from 'react'
import { MessageSquareWarning, Paperclip, X, Send, ShieldCheck, ShieldX, FileText, Image as ImageIcon, Loader2, ClipboardList, ChevronDown } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { formatDateTime } from '@/lib/utils'
import { useScrollLock } from '@/lib/useScrollLock'

// Reason quick-picks per dispute origin (folded into the first thread message).
const DISPUTE_REASONS: Record<string, string[]> = {
  snag: ['Work was completed correctly', 'Snag is outside the agreed scope', 'Defect not caused by our work', 'Insufficient detail provided', 'Other'],
  evidence: ['Requested evidence already provided', 'Request is outside the agreed scope', 'Evidence not applicable to this job', 'Insufficient detail provided', 'Other'],
  variation: ['Variation was pre-approved', 'Work is within the agreed scope', 'The decline reason is incorrect', 'Insufficient detail provided', 'Other'],
  quote_declined: ['The decline reason is incorrect', 'The quote met the requested scope', 'Pricing was competitive for the scope', 'Insufficient detail provided', 'Other'],
}
const ORIGIN_CARD_LABEL: Record<string, string> = { snag: 'SNAG', evidence: 'EVIDENCE REQUEST', variation: 'VARIATION', quote_declined: 'QUOTE DECLINE' }

// Narrow an unknown catch value to the message shown in the inline error banner.
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// One cell of the raise-dispute subject card (origin · ticket id · store).
function DisputeInfoCell({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2 first:pt-0 last:pb-0 sm:px-4 sm:py-0 sm:first:pl-0 sm:last:pr-0">
      {icon && <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400">{icon}</span>}
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">{label}</p>
        <p className="truncate text-sm font-bold text-[var(--text)]">{value}</p>
      </div>
    </div>
  )
}

export interface DisputeMessage {
  id: string
  author_role: 'supplier' | 'regional_manager' | string
  body: string | null
  evidence_urls: string[]
  created_at: string
}
export interface DisputeRecord {
  id: string
  origin: 'snag' | 'evidence_requested' | 'variation' | 'quote_declined' | string
  status: 'open' | 'resolved' | string
  outcome: 'upheld' | 'withdrawn' | string | null
  resolution_note: string | null
  // Current pending proposal (propose → the other side confirms). 'withdrawn' = a
  // proposal to drop the request; 'upheld' = a proposal to keep it (stands).
  pending_outcome?: 'withdrawn' | 'upheld' | string | null
  pending_by?: 'supplier' | 'regional_manager' | string | null
  created_at: string
  resolved_at: string | null
}

// Origin → the word used for the disputed request across the UI.
const originWord = (o: string) => o === 'snag' ? 'snag' : o === 'variation' ? 'variation order' : o === 'quote_declined' ? 'quote decline' : 'evidence request'

const ROLE_LABEL: Record<string, string> = { supplier: 'Supplier', regional_manager: 'Regional Manager', system: 'System' }

// Chat avatar tint + initial per author role.
const AVATAR_CLS: Record<string, string> = {
  supplier: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  regional_manager: 'bg-teal-500/20 text-teal-700 dark:text-teal-300',
  system: 'bg-[var(--surface-2)] text-[var(--text-faint)]',
}
const roleInitial = (role: string) => role === 'supplier' ? 'S' : role === 'regional_manager' ? 'M' : 'i'
const isImageUrl = (url: string) => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)
function attachmentName(url: string): string {
  try {
    const raw = decodeURIComponent((url.split('?')[0].split('/').pop() || '').trim())
    return raw.replace(/^\d{6,}-[a-z0-9]{4,}-/i, '') || 'Attachment'
  } catch { return 'Attachment' }
}
// The raise message stores "Reason: <x>\n\n<explanation>" — split the reason out
// so it renders as its own pill above the body.
function splitReason(body: string): { reason: string | null; rest: string } {
  const m = body.match(/^Reason:\s*(.+?)(?:\n\n|\n|$)/)
  if (!m) return { reason: null, rest: body }
  return { reason: m[1].trim(), rest: body.slice(m[0].length).trim() }
}

async function uploadEvidence(_ticketId: string, file: File): Promise<string> {
  // Non-image evidence → the ticket-docs bucket, which accepts PDF/Word/Excel/text
  // (completion-docs only allows images + PDF, so .doc/.docx uploads were rejected).
  const bucket = file.type.startsWith('image/') ? 'ticket-photos' : 'ticket-docs'
  return uploadOne(file, bucket)
}

// Message + evidence composer, shared by the initial raise and each reply.
function Composer({ ticketId, action, submitLabel, placeholder, onDone }: { ticketId: string; action: 'raise' | 'reply'; submitLabel: string; placeholder: string; onDone?: () => void }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Object-URL previews for the picked IMAGE files (null slots for documents),
  // revoked whenever the selection changes / on unmount.
  const previews = useMemo(() => files.map(f => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [files])
  useEffect(() => () => { previews.forEach(u => { if (u) URL.revokeObjectURL(u) }) }, [previews])
  // Keep each file's index in `files` so remove works from either list.
  const images = files.map((f, i) => ({ f, i })).filter(({ f }) => f.type.startsWith('image/'))
  const docs = files.map((f, i) => ({ f, i })).filter(({ f }) => !f.type.startsWith('image/'))

  async function submit() {
    if (!text.trim() && !files.length) { setErr('Add a message or attach evidence.'); return }
    setBusy(true); setErr('')
    try {
      const urls: string[] = []
      for (const f of files) urls.push(await uploadEvidence(ticketId, f))
      const res = await fetch(`/api/tickets/${ticketId}/dispute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, body: text.trim() || null, evidenceUrls: urls }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      setText(''); setFiles([]); onDone?.(); router.refresh()
    } catch (e) { setErr(errMsg(e)) }
    // Always clear the busy flag — router.refresh() keeps this client component
    // mounted, so without this the button stays stuck on "Sending…" after success.
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-2.5">
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} rows={3}
        className="w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] focus:ring-blue-500/40 outline-none" />
      {/* Picked images preview as thumbnails (like the photo uploaders); documents
          keep the compact text rows. */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map(({ f, i }) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-[var(--border)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL preview, not a remote asset */}
              <img src={previews[i]!} alt={f.name} className="h-full w-full object-cover" />
              <button type="button" onClick={() => setFiles(p => p.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white transition hover:bg-red-500">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <div className="space-y-1">
          {docs.map(({ f, i }) => (
            <div key={i} className="flex items-center justify-between gap-2 text-sm text-[var(--text-muted)]">
              <span className="truncate min-w-0 flex items-center gap-1.5"><FileText size={13} />{f.name}</span>
              <button type="button" onClick={() => setFiles(p => p.filter((_, j) => j !== i))} className="shrink-0 text-[var(--text-faint)] hover:text-red-500"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl ring-1 ring-[var(--border)] text-sm text-[var(--text)] cursor-pointer hover:bg-[var(--hover)] transition shrink-0">
          <Paperclip size={15} /> Attach
          <input type="file" accept="image/*,.pdf,.doc,.docx" multiple className="hidden" onChange={e => { setFiles(p => [...p, ...Array.from(e.target.files ?? [])].slice(0, 10)); setErr('') }} />
        </label>
        <button onClick={submit} disabled={busy} className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-1.5">
          {busy ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : <><Send size={14} /> {submitLabel}</>}
        </button>
      </div>
    </div>
  )
}

// Supplier-only raise-dispute pop-up. `trigger` lets it live inside a "More" menu
// (renders a custom opener); without it, the default full-width red button shows.
const MAX_DISPUTE_CHARS = 1000
const MAX_DISPUTE_FILES = 5
export function RaiseDisputeButton({ ticketId, origin, subjectTitle, jobRef, store, trigger, label, defaultOpen = false, onClose }: {
  ticketId: string; origin: 'snag' | 'evidence' | 'variation' | 'quote_declined'
  subjectTitle?: string | null; jobRef?: string | null; store?: string | null
  trigger?: (open: () => void) => ReactNode; defaultOpen?: boolean; onClose?: () => void
  /** Text of the default opener button (Server Components can't pass a `trigger` fn). */
  label?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [reason, setReason] = useState('')
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useScrollLock(open)
  const what = origin === 'snag' ? 'snag' : origin === 'variation' ? 'variation-order decline' : origin === 'quote_declined' ? 'quote decline' : 'evidence request'
  const reset = () => { setReason(''); setText(''); setFiles([]); setErr('') }
  const close = () => { setOpen(false); reset(); onClose?.() }
  // Snapshot the live FileList before the input is cleared (lazy reads inside the
  // state updater would find it already emptied).
  const addFiles = (list: FileList | null) => { const picked = Array.from(list ?? []); setFiles(p => [...p, ...picked].slice(0, MAX_DISPUTE_FILES)); setErr('') }

  async function submit() {
    if (!reason) { setErr('Choose a reason for the dispute.'); return }
    if (!text.trim()) { setErr('Explain why you disagree.'); return }
    setBusy(true); setErr('')
    try {
      const urls: string[] = []
      for (const f of files) urls.push(await uploadEvidence(ticketId, f))
      const body = `Reason: ${reason}\n\n${text.trim()}`
      const res = await fetch(`/api/tickets/${ticketId}/dispute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'raise', body, evidenceUrls: urls }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      setOpen(false); reset(); router.refresh()
    } catch (e) { setErr(errMsg(e)) }
    finally { setBusy(false) }
  }

  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (!defaultOpen &&
        <button onClick={() => setOpen(true)} className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition flex items-center justify-center gap-1.5">
          <MessageSquareWarning size={15} /> {label ?? 'Raise dispute'}
        </button>
      )}
      {open && (
        // Bottom-sheet on phones (mirrors components/ui/Modal), centered from sm up.
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={close}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] sm:max-h-[90vh] sm:rounded-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-4 pt-5 sm:px-6 sm:pt-6">
              <h3 className="flex items-center gap-2.5 text-xl font-bold text-[var(--text)]"><MessageSquareWarning size={22} className="text-red-500" /> Raise a dispute</h3>
              <button onClick={close} aria-label="Close" className="-m-1 rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"><X size={20} /></button>
            </div>

            <div className="space-y-5 p-4 sm:p-6">
              {/* Quote-decline disputes are thread-only — nothing on the ticket pauses. */}
              <p className="text-sm text-[var(--text-muted)]">{origin === 'quote_declined'
                ? 'Raising a dispute opens a conversation with the client about this quote decline — the decision stands unless the client retracts it.'
                : `Raising a dispute pauses this ${what} until it is resolved.`} Explain why you disagree and attach supporting evidence. Messages exchanged with the client will be recorded for audit purposes.</p>

              {/* Subject info card — stacks on phones (three side-by-side cells need
                  ~450px inside the modal); sm+ keeps the divided row. */}
              <div className="flex flex-col divide-y divide-[var(--border)] rounded-xl bg-[var(--surface)] px-4 py-3 ring-1 ring-[var(--border)] sm:flex-row sm:items-stretch sm:divide-x sm:divide-y-0">
                <DisputeInfoCell icon={<ClipboardList size={18} />} label={ORIGIN_CARD_LABEL[origin]} value={subjectTitle || '—'} />
                <DisputeInfoCell label="TICKET ID" value={jobRef || '—'} />
                <DisputeInfoCell label="STORE" value={store || '—'} />
              </div>

              {/* Reason */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[var(--text)]">Reason for dispute <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select value={reason} onChange={e => { setReason(e.target.value); setErr('') }} className="w-full appearance-none rounded-xl bg-[var(--input-bg)] px-3.5 py-3 pr-10 text-sm text-[var(--text)] ring-1 ring-[var(--border)] outline-none focus:ring-2 focus:ring-blue-500/40">
                    <option value="">Select a reason…</option>
                    {DISPUTE_REASONS[origin].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
                </div>
              </div>

              {/* Explanation */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[var(--text)]">Explain why you disagree <span className="text-red-500">*</span></label>
                <div className="relative">
                  <textarea value={text} onChange={e => { setText(e.target.value.slice(0, MAX_DISPUTE_CHARS)); setErr('') }} rows={4} placeholder="Provide a clear explanation of your position…"
                    className="w-full rounded-xl bg-[var(--input-bg)] px-3.5 py-3 pb-7 text-sm text-[var(--text)] ring-1 ring-[var(--border)] outline-none placeholder-[var(--text-faint)] focus:ring-2 focus:ring-blue-500/40" />
                  <span className="pointer-events-none absolute bottom-2.5 right-3.5 text-[11px] tabular-nums text-[var(--text-faint)]">{text.length} / {MAX_DISPUTE_CHARS}</span>
                </div>
              </div>

              {/* Evidence dropzone */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[var(--text)]">Add evidence <span className="font-normal text-[var(--text-faint)]">(optional)</span></label>
                <label
                  onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-dashed border-[var(--border)] px-4 py-4 transition hover:border-blue-500/60 hover:bg-[var(--hover)]">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400"><Paperclip size={18} /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--text)]"><span className="text-[var(--text)]">Add files</span> <span className="font-normal text-[var(--text-muted)]">or drag and drop</span></span>
                      <span className="block text-[11px] text-[var(--text-faint)]">Photos, PDF or documents · Maximum 10 MB each</span>
                    </span>
                  </span>
                  {/* The whole dropzone label is clickable — the pill is desktop-only. */}
                  <span className="hidden shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-blue-600 ring-1 ring-[var(--border)] transition hover:bg-blue-500/10 dark:text-blue-400 sm:inline-flex">Browse files</span>
                  <input type="file" accept="image/*,.pdf,.doc,.docx" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.currentTarget.value = '' }} />
                </label>
                {files.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-muted)] ring-1 ring-[var(--border)]">
                        <span className="flex min-w-0 items-center gap-1.5 truncate">{f.type.startsWith('image/') ? <ImageIcon size={13} className="shrink-0" /> : <FileText size={13} className="shrink-0" />}<span className="truncate">{f.name}</span></span>
                        <button type="button" onClick={() => setFiles(p => p.filter((_, j) => j !== i))} className="shrink-0 text-[var(--text-faint)] hover:text-red-500"><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                ) : <p className="mt-2 text-xs text-[var(--text-faint)]">You can add up to {MAX_DISPUTE_FILES} files.</p>}
              </div>

              {err && <p className="text-sm text-red-500">{err}</p>}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-4 sm:px-6">
              <button type="button" onClick={close} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-[var(--text)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-50">Cancel</button>
              <button type="button" onClick={submit} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50">
                {busy ? <><Loader2 size={15} className="animate-spin" /> Raising…</> : <><Send size={15} /> Raise dispute</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// A compact "More" button (sits next to a primary action) whose only item opens
// the raise-dispute pop-up. The pop-up is a sibling driven by lifted state, so it
// stays mounted when the menu closes.
export function RaiseDisputeMore(props: { ticketId: string; origin: 'snag' | 'evidence' | 'variation'; subjectTitle?: string | null; jobRef?: string | null; store?: string | null; fullWidth?: boolean }) {
  const [menu, setMenu] = useState(false)
  const [modal, setModal] = useState(false)
  return (
    <>
      <div className={`relative ${props.fullWidth ? '' : 'shrink-0'}`}>
        <button type="button" onClick={() => setMenu(m => !m)} aria-haspopup="menu" aria-expanded={menu}
          className={`${props.fullWidth ? 'w-full justify-center' : ''} flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]`}>
          More <ChevronDown size={15} className={`transition-transform ${menu ? 'rotate-180' : ''}`} />
        </button>
        {menu && (
          <>
            <button aria-hidden tabIndex={-1} onClick={() => setMenu(false)} className="fixed inset-0 z-10 cursor-default" />
            <div role="menu" className="absolute right-0 z-20 mt-2 w-56 max-w-[calc(100vw-2.5rem)] rounded-xl bg-[var(--surface-2)] p-1.5 shadow-lg shadow-black/20 ring-1 ring-[var(--border)]">
              <button type="button" role="menuitem" onClick={() => { setMenu(false); setModal(true) }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-500/10 dark:text-red-400">
                <MessageSquareWarning size={16} /> Raise dispute
              </button>
            </div>
          </>
        )}
      </div>
      {modal && <RaiseDisputeButton {...props} defaultOpen onClose={() => setModal(false)} />}
    </>
  )
}

// Today-queue "View dispute" pop-up — fetches the ticket's open dispute + messages
// on open and shows the full chat + resolve controls in place (no navigation).
export function DisputeReviewButton({ ticketId, viewerRole, trigger }: {
  ticketId: string; viewerRole: 'supplier' | 'regional_manager'; trigger: (open: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ dispute: DisputeRecord; messages: DisputeMessage[]; subject: string | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) return
    let live = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets fetch state when the pop-up opens, before the async load; cannot run during render
    setLoading(true); setErr('')
    fetch(`/api/tickets/${ticketId}/dispute`)
      .then(r => r.json())
      .then(d => { if (!live) return; if (d?.error) setErr(d.error); else setData(d?.dispute ? d : null) })
      .catch(() => { if (live) setErr('Could not load the dispute.') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [open, ticketId])
  return (
    <>
      {trigger(() => setOpen(true))}
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-2xl">
          {close => (
            <>
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-lg font-bold text-[var(--text)]"><MessageSquareWarning size={19} className="text-red-500" /> Dispute conversation</h3>
                <button type="button" onClick={close} aria-label="Close" className="-m-1 rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"><X size={18} /></button>
              </div>
              {loading ? <p className="py-4 text-center text-sm text-[var(--text-faint)]">Loading…</p>
                : err ? <p className="text-sm text-red-500">{err}</p>
                : data ? <DisputeThread ticketId={ticketId} dispute={data.dispute} messages={data.messages} viewerRole={viewerRole} subject={data.subject} />
                : <p className="py-4 text-center text-sm text-[var(--text-faint)]">No open dispute on this ticket.</p>}
            </>
          )}
        </Modal>
      )}
    </>
  )
}

// One server copy of the open dispute + its thread, as returned by the GET.
type DisputeSnapshot = { dispute: DisputeRecord; messages: DisputeMessage[]; subject: string | null }

// Poll the open-dispute GET while `live` (mirrors TicketChat — deny-all RLS means
// no browser Realtime, so a plain interval keeps both sides' threads + proposal
// state current). `snap` stays undefined until the first fetch lands, then holds
// the latest server copy — or null once the server reports no open dispute
// (resolved). `refresh` forces an immediate refetch (used right after a send /
// propose / confirm so the UI flips without waiting out the interval).
const POLL_MS = 6000
function useDisputePoll(ticketId: string, live: boolean): { snap: DisputeSnapshot | null | undefined; refresh: () => void } {
  const [snap, setSnap] = useState<DisputeSnapshot | null | undefined>(undefined)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!live) return
    let on = true
    const load = async () => {
      try {
        const r = await fetch(`/api/tickets/${ticketId}/dispute`)
        const d = await r.json()
        if (on && !d?.error) setSnap(d?.dispute ? d : null)
      } catch { /* transient failure — keep the last copy */ }
    }
    load()
    const t = setInterval(() => { if (on) load() }, POLL_MS)
    return () => { on = false; clearInterval(t) }
  }, [ticketId, live, tick])
  return { snap, refresh: () => setTick(n => n + 1) }
}

// The full thread: numbered messages, a reply composer while open, and the RM's
// resolve controls. Read-only once resolved (also used for the Archive history).
export function DisputeThread({ ticketId, dispute, messages, viewerRole, readOnly = false, subject, hideControls = false }: {
  ticketId: string; dispute: DisputeRecord; messages: DisputeMessage[]
  viewerRole: 'supplier' | 'regional_manager'; readOnly?: boolean
  /** What the dispute is about (e.g. "Submission #2 · snag") — shown at the top. */
  subject?: string | null
  /** Hide the resolve/propose controls (the supplier surfaces them in the Next-action block instead). */
  hideControls?: boolean
}) {
  const router = useRouter()
  // The server-rendered props are a point-in-time copy — while the dispute is open,
  // poll the GET so the other side's replies + proposals appear without a manual
  // refresh, and feed the live pending state down to the inline controls. Apply the
  // polled copy only when it is THIS dispute (the GET returns the ticket's current
  // open dispute, which can differ on a multi-dispute ticket).
  const wantLive = dispute.status === 'open' && !readOnly
  const { snap, refresh } = useDisputePoll(ticketId, wantLive)
  const fresh = snap && snap.dispute.id === dispute.id ? snap : null
  const d = fresh?.dispute ?? dispute
  const msgs = fresh?.messages ?? messages
  // The dispute left the open set (the other side confirmed/resolved it) — re-render
  // the server page ONCE so the resolved banner + next-action block take over (the
  // ref guard stops the every-poll snapshot objects from refresh-looping).
  const bumped = useRef(false)
  useEffect(() => {
    if (!wantLive || snap === undefined) return
    if (snap === null || snap.dispute.id !== dispute.id) {
      if (!bumped.current) { bumped.current = true; router.refresh() }
    } else bumped.current = false
  }, [wantLive, snap, dispute.id, router])

  const isOpen = d.status === 'open' && !readOnly
  const what = originWord(d.origin)
  const What = `${what[0].toUpperCase()}${what.slice(1)}`

  return (
    <div className="space-y-3">
      {subject && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Regarding {subject}</p>
      )}
      {d.status === 'resolved' && (
        <div className={`rounded-lg p-3 ring-1 ${d.outcome === 'withdrawn' ? 'bg-emerald-500/10 ring-emerald-500/30' : 'bg-amber-500/10 ring-amber-500/30'}`}>
          <p className={`text-[11px] font-bold uppercase tracking-wide ${d.outcome === 'withdrawn' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
            {d.outcome === 'withdrawn'
              ? (d.origin === 'variation' ? 'Variation-order decline retracted — reopened for review'
                : d.origin === 'quote_declined' ? 'Quote decline retracted — the manager will revisit the quote'
                : `${What} retracted — dropped`)
              : (d.origin === 'variation' ? 'Variation-order decline upheld — stays declined'
                : d.origin === 'quote_declined' ? 'Quote decline upheld — the decision stands'
                : `${What} upheld — stands`)}
          </p>
          {d.resolution_note && <p className="text-sm text-[var(--text)]">{d.resolution_note}</p>}
        </div>
      )}

      {/* Chat thread — the viewer's own messages sit right (blue), the other side's
          left (surface). Attachments keep a running count PER SIDE across the whole
          thread ("Evidence Supplier 1/2…", "Evidence RM 1/2…") for stable references. */}
      {msgs.length > 0 && (
        <div className="max-h-[440px] space-y-3 overflow-y-auto rounded-xl bg-[var(--app-bg)] p-3 ring-1 ring-[var(--border)]">
          {msgs.map(m => {
            // A system note (e.g. "Dispute created and SLA timer paused") sits centred.
            if (m.author_role === 'system') {
              return (
                <div key={m.id} className="flex justify-center">
                  <span className="rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-center text-[11px] text-[var(--text-muted)]">System · {formatDateTime(m.created_at)}{m.body ? ` — ${m.body}` : ''}</span>
                </div>
              )
            }
            const mine = m.author_role === viewerRole
            const { reason, rest } = splitReason(m.body ?? '')
            const urls = m.evidence_urls ?? []
            return (
              <div key={m.id} className={`flex items-start gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold ${AVATAR_CLS[m.author_role] ?? AVATAR_CLS.system}`}>{roleInitial(m.author_role)}</span>
                <div className={`min-w-0 max-w-[82%] rounded-2xl px-3.5 py-2.5 ${mine ? 'rounded-tr-sm bg-blue-600 text-white' : 'rounded-tl-sm bg-[var(--surface)] text-[var(--text)] ring-1 ring-[var(--border)]'}`}>
                  <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={`text-[11px] font-bold ${mine ? 'text-white' : 'text-[var(--text)]'}`}>{mine ? 'You' : (ROLE_LABEL[m.author_role] ?? m.author_role)}{mine ? ` · ${ROLE_LABEL[m.author_role] ?? ''}` : ''}</span>
                    <span className={`text-[10px] ${mine ? 'text-white/60' : 'text-[var(--text-faint)]'}`}>{formatDateTime(m.created_at)}</span>
                  </div>
                  {reason && (
                    <span className={`mb-1.5 inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${mine ? 'bg-white/15 text-white' : 'bg-violet-500/15 text-violet-700 dark:text-violet-300'}`}>Reason: {reason}</span>
                  )}
                  {rest && <p className="whitespace-pre-line break-words text-sm">{rest}</p>}
                  {urls.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <p className={`text-[10px] font-semibold uppercase tracking-wide ${mine ? 'text-white/70' : 'text-[var(--text-faint)]'}`}>Attachment{urls.length === 1 ? '' : `s (${urls.length})`}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {urls.map((u, j) => (
                          <ViewTrackedLink key={j} ticketId={ticketId} itemType="attachment" itemLabel={attachmentName(u)} href={u}
                            className={`flex max-w-[200px] items-center gap-2 rounded-lg p-1.5 pr-2.5 transition ${mine ? 'bg-white/10 hover:bg-white/20' : 'bg-[var(--surface-2)] ring-1 ring-[var(--border)] hover:bg-[var(--hover)]'}`}>
                            {isImageUrl(u)
                              /* eslint-disable-next-line @next/next/no-img-element -- signed remote evidence thumbnail */
                              ? <img src={u} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                              : <span className={`grid h-9 w-9 shrink-0 place-items-center rounded ${mine ? 'bg-white/15 text-white' : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'}`}><FileText size={16} /></span>}
                            <span className={`min-w-0 truncate text-[11px] font-medium ${mine ? 'text-white' : 'text-[var(--text)]'}`}>{attachmentName(u)}</span>
                          </ViewTrackedLink>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Reply while open — a successful send refetches the thread immediately so
          the new message lands without waiting out the poll interval. */}
      {isOpen && <Composer ticketId={ticketId} action="reply" submitLabel="Send" placeholder="Write a reply or add evidence…" onDone={refresh} />}

      {/* Negotiation controls: either side can concede unilaterally, or propose an
          outcome the other must confirm (propose → confirm). Hidden when the caller
          renders them elsewhere (supplier → Next-action block). The thread already
          polls, so the inline controls skip their own poll and ride its live state. */}
      {isOpen && !hideControls && <DisputeControls ticketId={ticketId} origin={d.origin} viewerRole={viewerRole} pendingOutcome={d.pending_outcome ?? null} pendingBy={d.pending_by ?? null} poll={false} onAction={refresh} />}
    </div>
  )
}

// Dispute resolution. Each side can CONCEDE unilaterally (supplier withdraws → the
// request stands; RM retracts → it's dropped), or PROPOSE an outcome the OTHER side
// must confirm (supplier proposes to resolve/drop; RM proposes to keep — 'upheld').
export function DisputeControls({ ticketId, origin, viewerRole, pendingOutcome, pendingBy, poll = true, onAction }: {
  ticketId: string; origin: string; viewerRole: 'supplier' | 'regional_manager'
  pendingOutcome: string | null; pendingBy: string | null
  /** Skip the internal poll when a parent (DisputeThread) already feeds live props. */
  poll?: boolean
  /** Extra refetch fired after a successful action (the parent thread's refresh). */
  onAction?: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const what = originWord(origin)
  // Standalone usages (the next-action blocks) render from server props that go
  // stale — poll the GET so the other side's proposal flips these buttons live.
  // The polled copy applies only while it still matches this block's dispute
  // (same origin); once it doesn't (resolved / superseded), the pending state
  // clears and the server page re-renders ONCE (ref-guarded against loops).
  const { snap, refresh } = useDisputePoll(ticketId, poll)
  const polled = poll ? snap : undefined
  const match = polled && polled.dispute.origin === origin ? polled.dispute : undefined
  const gone = polled !== undefined && !match
  const pOutcome = match ? (match.pending_outcome ?? null) : gone ? null : pendingOutcome
  const pBy = match ? (match.pending_by ?? null) : gone ? null : pendingBy
  const bumped = useRef(false)
  useEffect(() => {
    if (!poll || snap === undefined) return
    if (snap === null || snap.dispute.origin !== origin) {
      if (!bumped.current) { bumped.current = true; router.refresh() }
    } else bumped.current = false
  }, [poll, snap, origin, router])

  async function act(action: string) {
    setBusy(action); setErr('')
    try {
      const res = await fetch(`/api/tickets/${ticketId}/dispute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      // Refetch the dispute right away so propose/confirm/cancel feedback shows
      // without waiting out the poll interval, then re-render the server page.
      refresh(); onAction?.(); router.refresh()
    } catch (e) { setErr(errMsg(e)) }
    // Always clear busy — router.refresh() keeps this client component mounted, so
    // without this the buttons stay disabled after a successful action (e.g. cancel).
    finally { setBusy('') }
  }

  const pending = !!pOutcome && !!pBy
  const iAmProposer = pending && pBy === viewerRole
  // 'withdrawn' = a proposal to DROP the request; 'upheld' = keep it (stands).
  const proposalText = pOutcome === 'withdrawn' ? `drop the ${what}` : `keep the ${what} — it stands`
  const otherLabel = (r: string) => r === 'supplier' ? 'supplier' : 'client'

  // Role action set (propose + solo concede). Hidden for the proposer while waiting.
  const actions = viewerRole === 'supplier' ? (
    <>
      <button onClick={() => act('propose')} disabled={!!busy} className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-50">{busy === 'propose' ? 'Proposing…' : <><span className="sm:hidden">Propose to resolve</span><span className="hidden sm:inline">Propose to resolve — drop the {what}</span></>}</button>
      <button onClick={() => act('withdraw')} disabled={!!busy} className="w-full py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text)] text-sm font-semibold hover:bg-[var(--hover)] transition disabled:opacity-50 flex items-center justify-center gap-1.5"><ShieldCheck size={14} /> {busy === 'withdraw' ? 'Withdrawing…' : <><span className="sm:hidden">Withdraw dispute</span><span className="hidden sm:inline">Withdraw dispute — accept the {what}</span></>}</button>
    </>
  ) : (
    <>
      <button onClick={() => act('propose')} disabled={!!busy} className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-50">{busy === 'propose' ? 'Proposing…' : `Propose to keep the ${what}`}</button>
      <button onClick={() => act('retract')} disabled={!!busy} className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-1.5"><ShieldX size={14} /> {busy === 'retract' ? 'Retracting…' : `Retract the ${what}`}</button>
    </>
  )

  return (
    <div className="rounded-xl ring-1 ring-[var(--border)] bg-[var(--input-bg)] p-3 space-y-2.5">
      {pending && iAmProposer && (
        <div className="rounded-lg ring-1 ring-[#f59e0b]/30 bg-[#f59e0b]/10 p-2.5 space-y-2">
          <p className="text-sm text-[var(--text)]">Waiting for the {otherLabel(viewerRole === 'supplier' ? 'regional_manager' : 'supplier')} to confirm your proposal to <span className="font-semibold">{proposalText}</span>.</p>
          <button onClick={() => act('cancel')} disabled={!!busy} className="w-full py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm font-semibold disabled:opacity-50">{busy === 'cancel' ? 'Cancelling…' : 'Cancel proposal'}</button>
        </div>
      )}
      {pending && !iAmProposer && (
        <div className="rounded-lg ring-1 ring-[#f59e0b]/30 bg-[#f59e0b]/10 p-2.5 space-y-2">
          <p className="text-sm text-[var(--text)]">The {otherLabel(pBy!)} proposed to <span className="font-semibold">{proposalText}</span>. Both sides must agree.</p>
          <button onClick={() => act('confirm')} disabled={!!busy} className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">{busy === 'confirm' ? 'Agreeing…' : 'Agree'}</button>
        </div>
      )}
      {/* The proposer just waits; everyone else gets the action set (which counter-
          proposes / concedes). */}
      {!(pending && iAmProposer) && (
        <>
          <p className="text-sm font-semibold text-[var(--text)]">{pending ? 'Or resolve it another way' : 'Resolve the dispute'}</p>
          {actions}
        </>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  )
}
