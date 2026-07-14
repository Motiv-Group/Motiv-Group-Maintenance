'use client'

// Supplier↔RM dispute thread over a snag or a "more evidence" request. The supplier
// raises it (pausing the snag/evidence step); both sides post messages + evidence in
// a free-flowing numbered thread until the RM resolves it as upheld or withdrawn.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadOne } from '@/lib/upload'
import type { ReactNode } from 'react'
import { MessageSquareWarning, Paperclip, X, Send, ShieldCheck, ShieldX, FileText, Image as ImageIcon, Loader2, ClipboardList, ChevronDown } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

// Reason quick-picks per dispute origin (folded into the first thread message).
const DISPUTE_REASONS: Record<string, string[]> = {
  snag: ['Work was completed correctly', 'Snag is outside the agreed scope', 'Defect not caused by our work', 'Insufficient detail provided', 'Other'],
  evidence: ['Requested evidence already provided', 'Request is outside the agreed scope', 'Evidence not applicable to this job', 'Insufficient detail provided', 'Other'],
  variation: ['Variation was pre-approved', 'Work is within the agreed scope', 'The decline reason is incorrect', 'Insufficient detail provided', 'Other'],
}
const ORIGIN_CARD_LABEL: Record<string, string> = { snag: 'SNAG', evidence: 'EVIDENCE REQUEST', variation: 'VARIATION' }

// One cell of the raise-dispute subject card (origin · ticket id · store).
function DisputeInfoCell({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 first:pl-0 last:pr-0">
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
  origin: 'snag' | 'evidence_requested' | 'variation' | string
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
const originWord = (o: string) => o === 'snag' ? 'snag' : o === 'variation' ? 'variation order' : 'evidence request'

const ROLE_LABEL: Record<string, string> = { supplier: 'Supplier', regional_manager: 'Regional Manager' }

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

  async function submit() {
    if (!text.trim() && !files.length) { setErr('Add a message or attach evidence.'); return }
    setBusy(true); setErr('')
    try {
      const urls: string[] = []
      for (const f of files) urls.push(await uploadEvidence(ticketId, f))
      const res = await fetch(`/api/tickets/${ticketId}/dispute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, body: text.trim() || null, evidenceUrls: urls }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      setText(''); setFiles([]); onDone?.(); router.refresh()
    } catch (e: any) { setErr(e.message) }
    // Always clear the busy flag — router.refresh() keeps this client component
    // mounted, so without this the button stays stuck on "Sending…" after success.
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-2.5">
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} rows={3}
        className="w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] focus:ring-[#C6A35D]/40 outline-none" />
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-sm text-[var(--text-muted)]">
              <span className="truncate min-w-0 flex items-center gap-1.5">{f.type.startsWith('image/') ? <ImageIcon size={13} /> : <FileText size={13} />}{f.name}</span>
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
        <button onClick={submit} disabled={busy} className="flex-1 py-2 rounded-xl bg-[#C6A35D] hover:brightness-95 text-[#0a0e17] text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-1.5">
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
export function RaiseDisputeButton({ ticketId, origin, subjectTitle, jobRef, store, trigger, defaultOpen = false, onClose }: {
  ticketId: string; origin: 'snag' | 'evidence' | 'variation'
  subjectTitle?: string | null; jobRef?: string | null; store?: string | null
  trigger?: (open: () => void) => ReactNode; defaultOpen?: boolean; onClose?: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [reason, setReason] = useState('')
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const what = origin === 'snag' ? 'snag' : origin === 'variation' ? 'variation-order decline' : 'evidence request'
  const reset = () => { setReason(''); setText(''); setFiles([]); setErr('') }
  const close = () => { setOpen(false); reset(); onClose?.() }
  const addFiles = (list: FileList | null) => { setFiles(p => [...p, ...Array.from(list ?? [])].slice(0, MAX_DISPUTE_FILES)); setErr('') }

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
    } catch (e: any) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (!defaultOpen &&
        <button onClick={() => setOpen(true)} className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition flex items-center justify-center gap-1.5">
          <MessageSquareWarning size={15} /> Raise dispute
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={close}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[var(--surface-2)] ring-1 ring-[var(--border)]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-6 pt-6">
              <h3 className="flex items-center gap-2.5 text-xl font-bold text-[var(--text)]"><MessageSquareWarning size={22} className="text-red-500" /> Raise a dispute</h3>
              <button onClick={close} aria-label="Close" className="-m-1 rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"><X size={20} /></button>
            </div>

            <div className="space-y-5 p-6">
              <p className="text-sm text-[var(--text-muted)]">Raising a dispute pauses this {what} until it is resolved. Explain why you disagree and attach supporting evidence. Messages exchanged with the client will be recorded for audit purposes.</p>

              {/* Subject info card */}
              <div className="flex items-stretch divide-x divide-[var(--border)] rounded-xl bg-[var(--surface)] px-4 py-3 ring-1 ring-[var(--border)]">
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
                  <span className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-blue-600 ring-1 ring-[var(--border)] transition hover:bg-blue-500/10 dark:text-blue-400">Browse files</span>
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
            <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-6 py-4">
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

// The full thread: numbered messages, a reply composer while open, and the RM's
// resolve controls. Read-only once resolved (also used for the Archive history).
export function DisputeThread({ ticketId, dispute, messages, viewerRole, readOnly = false, subject }: {
  ticketId: string; dispute: DisputeRecord; messages: DisputeMessage[]
  viewerRole: 'supplier' | 'regional_manager'; readOnly?: boolean
  /** What the dispute is about (e.g. "Submission #2 · snag") — shown at the top. */
  subject?: string | null
}) {
  const isOpen = dispute.status === 'open' && !readOnly
  const what = originWord(dispute.origin)
  const What = `${what[0].toUpperCase()}${what.slice(1)}`

  return (
    <div className="space-y-3">
      {subject && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Regarding {subject}</p>
      )}
      {dispute.status === 'resolved' && (
        <div className={`rounded-lg p-3 ring-1 ${dispute.outcome === 'withdrawn' ? 'bg-emerald-500/10 ring-emerald-500/30' : 'bg-amber-500/10 ring-amber-500/30'}`}>
          <p className={`text-[11px] font-bold uppercase tracking-wide ${dispute.outcome === 'withdrawn' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
            {dispute.outcome === 'withdrawn'
              ? (dispute.origin === 'variation' ? 'Variation-order decline retracted — reopened for review' : `${What} retracted — dropped`)
              : (dispute.origin === 'variation' ? 'Variation-order decline upheld — stays declined' : `${What} upheld — stands`)}
          </p>
          {dispute.resolution_note && <p className="text-sm text-[var(--text)]">{dispute.resolution_note}</p>}
        </div>
      )}

      {/* Numbered message thread. Attachments carry a running count PER SIDE across the
          whole thread — "Evidence Supplier 1/2…", "Evidence RM 1/2…" — so each piece of
          evidence has a stable reference. */}
      <ol className="space-y-2">
        {(() => { let supplierEv = 0, rmEv = 0; return messages.map((m, i) => {
          const evLabels = (m.evidence_urls ?? []).map(() =>
            m.author_role === 'supplier' ? `Evidence Supplier ${++supplierEv}` : `Evidence RM ${++rmEv}`)
          return (
          <li key={m.id} className="rounded-xl ring-1 ring-[var(--border)] bg-[var(--surface)] p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text)]">
                <span className="text-[var(--text-faint)]">{i + 1}.</span>
                {ROLE_LABEL[m.author_role] ?? m.author_role}
                {m.author_role === viewerRole && <span className="text-[9px] font-bold uppercase tracking-wide text-[#C6A35D] bg-[#C6A35D]/15 rounded-full px-1.5 py-0.5">you</span>}
              </span>
              <span className="text-[11px] text-[var(--text-faint)]">{formatDateTime(m.created_at)}</span>
            </div>
            {m.body && <p className="text-sm text-[var(--text)] whitespace-pre-line">{m.body}</p>}
            {m.evidence_urls?.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                {m.evidence_urls.map((u, j) => (
                  <a key={j} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-[#C6A35D] hover:underline"><Paperclip size={12} /> {evLabels[j]}</a>
                ))}
              </div>
            )}
          </li>
        )}) })()}
      </ol>

      {/* Reply while open */}
      {isOpen && <Composer ticketId={ticketId} action="reply" submitLabel="Send reply" placeholder="Add a message or evidence…" />}

      {/* Negotiation controls: either side can concede unilaterally, or propose an
          outcome the other must confirm (propose → confirm). */}
      {isOpen && <DisputeControls ticketId={ticketId} origin={dispute.origin} viewerRole={viewerRole} pendingOutcome={dispute.pending_outcome ?? null} pendingBy={dispute.pending_by ?? null} />}
    </div>
  )
}

// Dispute resolution. Each side can CONCEDE unilaterally (supplier withdraws → the
// request stands; RM retracts → it's dropped), or PROPOSE an outcome the OTHER side
// must confirm (supplier proposes to resolve/drop; RM proposes to uphold/keep).
function DisputeControls({ ticketId, origin, viewerRole, pendingOutcome, pendingBy }: {
  ticketId: string; origin: string; viewerRole: 'supplier' | 'regional_manager'
  pendingOutcome: string | null; pendingBy: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const what = originWord(origin)

  async function act(action: string) {
    setBusy(action); setErr('')
    try {
      const res = await fetch(`/api/tickets/${ticketId}/dispute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      router.refresh()
    } catch (e: any) { setErr(e.message) }
    // Always clear busy — router.refresh() keeps this client component mounted, so
    // without this the buttons stay disabled after a successful action (e.g. cancel).
    finally { setBusy('') }
  }

  const pending = !!pendingOutcome && !!pendingBy
  const iAmProposer = pending && pendingBy === viewerRole
  // 'withdrawn' = a proposal to DROP the request; 'upheld' = keep it (stands).
  const proposalText = pendingOutcome === 'withdrawn' ? `drop the ${what}` : `keep the ${what} — it stands`
  const otherLabel = (r: string) => r === 'supplier' ? 'supplier' : 'client'

  // Role action set (propose + solo concede). Hidden for the proposer while waiting.
  const actions = viewerRole === 'supplier' ? (
    <>
      <button onClick={() => act('propose')} disabled={!!busy} className="w-full py-2 rounded-lg bg-[#C6A35D] hover:brightness-95 text-[#0a0e17] text-sm font-semibold disabled:opacity-50">{busy === 'propose' ? 'Proposing…' : `Propose to resolve — drop the ${what}`}</button>
      <button onClick={() => act('withdraw')} disabled={!!busy} className="w-full py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text)] text-sm font-semibold hover:bg-[var(--hover)] transition disabled:opacity-50 flex items-center justify-center gap-1.5"><ShieldCheck size={14} /> {busy === 'withdraw' ? 'Withdrawing…' : `Withdraw dispute — accept the ${what}`}</button>
    </>
  ) : (
    <>
      <button onClick={() => act('propose')} disabled={!!busy} className="w-full py-2 rounded-lg bg-[#C6A35D] hover:brightness-95 text-[#0a0e17] text-sm font-semibold disabled:opacity-50">{busy === 'propose' ? 'Proposing…' : `Propose to uphold the ${what}`}</button>
      <button onClick={() => act('retract')} disabled={!!busy} className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-1.5"><ShieldX size={14} /> {busy === 'retract' ? 'Retracting…' : `Retract the ${what}`}</button>
    </>
  )

  return (
    <div className="rounded-xl ring-1 ring-[var(--border)] bg-[var(--input-bg)] p-3 space-y-2.5">
      {pending && iAmProposer && (
        <div className="rounded-lg ring-1 ring-[#C6A35D]/30 bg-[#C6A35D]/10 p-2.5 space-y-2">
          <p className="text-sm text-[var(--text)]">Waiting for the {otherLabel(viewerRole === 'supplier' ? 'regional_manager' : 'supplier')} to confirm your proposal to <span className="font-semibold">{proposalText}</span>.</p>
          <button onClick={() => act('cancel')} disabled={!!busy} className="w-full py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm font-semibold disabled:opacity-50">{busy === 'cancel' ? 'Cancelling…' : 'Cancel proposal'}</button>
        </div>
      )}
      {pending && !iAmProposer && (
        <div className="rounded-lg ring-1 ring-[#C6A35D]/30 bg-[#C6A35D]/10 p-2.5 space-y-2">
          <p className="text-sm text-[var(--text)]">The {otherLabel(pendingBy!)} proposed to <span className="font-semibold">{proposalText}</span>. Both sides must agree.</p>
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
