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
  origin: 'snag' | 'evidence_requested' | string
  status: 'open' | 'resolved' | string
  outcome: 'upheld' | 'withdrawn' | string | null
  resolution_note: string | null
  created_at: string
  resolved_at: string | null
}

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
    } catch (e: any) { setErr(e.message); setBusy(false) }
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
export function RaiseDisputeButton({ ticketId, origin }: { ticketId: string; origin: 'snag' | 'evidence' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full py-2.5 rounded-xl ring-1 ring-red-500/40 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-500/10 transition flex items-center justify-center gap-1.5">
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
              This pauses the {origin === 'snag' ? 'snag' : 'evidence request'} until the manager resolves it. Explain your case and attach any evidence — you and the manager can keep exchanging messages here.
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
export function DisputeThread({ ticketId, dispute, messages, viewerRole, readOnly = false }: {
  ticketId: string; dispute: DisputeRecord; messages: DisputeMessage[]
  viewerRole: 'supplier' | 'regional_manager'; readOnly?: boolean
}) {
  const isOpen = dispute.status === 'open' && !readOnly
  const isSnag = dispute.origin === 'snag'

  return (
    <div className="space-y-3">
      {dispute.status === 'resolved' && (
        <div className={`rounded-lg p-3 ring-1 ${dispute.outcome === 'withdrawn' ? 'bg-emerald-500/10 ring-emerald-500/30' : 'bg-amber-500/10 ring-amber-500/30'}`}>
          <p className={`text-[11px] font-bold uppercase tracking-wide ${dispute.outcome === 'withdrawn' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
            {dispute.outcome === 'withdrawn' ? (isSnag ? 'Snag withdrawn' : 'Evidence request withdrawn') : (isSnag ? 'Snag upheld' : 'Evidence request upheld')}
          </p>
          {dispute.resolution_note && <p className="text-sm text-[var(--text)]">{dispute.resolution_note}</p>}
        </div>
      )}

      {/* Numbered message thread */}
      <ol className="space-y-2">
        {messages.map((m, i) => (
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
                  <a key={j} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-[#C6A35D] hover:underline"><Paperclip size={12} /> Evidence {j + 1}</a>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>

      {/* Reply while open */}
      {isOpen && <Composer ticketId={ticketId} action="reply" submitLabel="Send reply" placeholder="Add a message or evidence…" />}

      {/* RM resolve controls */}
      {isOpen && viewerRole === 'regional_manager' && <ResolvePanel ticketId={ticketId} isSnag={isSnag} />}
    </div>
  )
}

function ResolvePanel({ ticketId, isSnag }: { ticketId: string; isSnag: boolean }) {
  const router = useRouter()
  const [choice, setChoice] = useState<'upheld' | 'withdrawn' | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function resolve() {
    if (!choice) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/tickets/${ticketId}/dispute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resolve', outcome: choice, note: note.trim() || null }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="rounded-xl ring-1 ring-[var(--border)] bg-[var(--input-bg)] p-3 space-y-2.5">
      <p className="text-sm font-semibold text-[var(--text)]">Resolve the dispute</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setChoice('upheld')} className={`py-2 rounded-lg text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${choice === 'upheld' ? 'bg-amber-500 text-white border-amber-500' : 'text-amber-600 dark:text-amber-400 border-amber-500/40 hover:border-amber-500'}`}>
          <ShieldCheck size={14} /> {isSnag ? 'Uphold snag' : 'Uphold request'}
        </button>
        <button onClick={() => setChoice('withdrawn')} className={`py-2 rounded-lg text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${choice === 'withdrawn' ? 'bg-emerald-600 text-white border-emerald-600' : 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 hover:border-emerald-500'}`}>
          <ShieldX size={14} /> {isSnag ? 'Withdraw snag' : 'Withdraw request'}
        </button>
      </div>
      {choice && (
        <p className="text-xs text-[var(--text-muted)]">
          {choice === 'upheld'
            ? (isSnag ? 'The snag stands — the supplier resumes accepting & scheduling the fix.' : 'The request stands — the supplier resumes uploading the evidence.')
            : 'The requirement is dropped and the job moves to close-out for your final sign-off.'}
        </p>
      )}
      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note explaining your decision (optional)…" rows={2}
        className="w-full px-3 py-2 rounded-lg bg-[var(--surface)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] outline-none focus:ring-[#C6A35D]/40" />
      {err && <p className="text-xs text-red-500">{err}</p>}
      <button onClick={resolve} disabled={!choice || busy} className="w-full py-2 rounded-lg bg-[#C6A35D] hover:brightness-95 text-[#0a0e17] text-sm font-semibold transition disabled:opacity-50">
        {busy ? 'Resolving…' : 'Confirm resolution'}
      </button>
    </div>
  )
}
