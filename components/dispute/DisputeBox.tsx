'use client'

// Supplier↔RM dispute thread over a snag or a "more evidence" request. The supplier
// raises it (pausing the snag/evidence step); both sides post messages + evidence in
// a free-flowing numbered thread until the RM resolves it as upheld or withdrawn.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MessageSquareWarning, Paperclip, X, Send, ShieldCheck, ShieldX, FileText, Image as ImageIcon, Loader2 } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

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

async function uploadEvidence(ticketId: string, file: File): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const bucket = file.type.startsWith('image/') ? 'ticket-photos' : 'completion-docs'
  const path = `${user?.id}/${ticketId}/dispute-${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name.replace(/[^\w.\-]/g, '_')}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) throw error
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
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

// Supplier-only button that opens the raise-dispute pop-up (composer + intro).
export function RaiseDisputeButton({ ticketId, origin }: { ticketId: string; origin: 'snag' | 'evidence' | 'variation' }) {
  const [open, setOpen] = useState(false)
  const what = origin === 'snag' ? 'snag' : origin === 'variation' ? 'variation-order decline' : 'evidence request'
  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition flex items-center justify-center gap-1.5">
        <MessageSquareWarning size={15} /> Raise dispute
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-[var(--surface-2)] ring-1 ring-[var(--border)] rounded-2xl p-5 max-w-md w-full space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-[var(--text)] flex items-center gap-2"><MessageSquareWarning size={17} className="text-red-500" /> Raise a dispute</p>
              <button onClick={() => setOpen(false)} className="p-1 -m-1 text-[var(--text-faint)] hover:text-[var(--text)]"><X size={18} /></button>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              This pauses the {what} until the dispute is resolved. Explain your case and attach any evidence — you and the client can keep exchanging messages here to keep an audit trail for the dispute.
            </p>
            <Composer ticketId={ticketId} action="raise" submitLabel="Raise dispute" placeholder="Explain why you disagree…" onDone={() => setOpen(false)} />
          </div>
        </div>
      )}
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
