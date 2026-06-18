'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Non-transition supplier helpers: progress updates + before/after/COC evidence
// uploads. Status moves (start work, submit quote/completion, resolve snag) are
// handled by <WorkflowActions>. Posts to the existing /api/supplier/ticket-action.
interface Props { ticketId: string; before: boolean; after: boolean; coc: boolean }

export function SupplierAttachments({ ticketId, before, after, coc }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setErr('')
    try {
      const res = await fetch('/api/supplier/ticket-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId, action, ...extra }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      router.refresh()
    } catch (e: any) { setErr(e.message) } finally { setBusy(null) }
  }

  async function upload(file: File, bucket: string, kind: string) {
    setBusy(kind); setErr('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const path = `${user?.id}/${ticketId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
      if (error) throw error
      const url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
      await act('add_evidence', { kind, url })
    } catch (e: any) { setErr(e.message); setBusy(null) }
  }

  return (
    <div className="space-y-3">
      {err && <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{err}</div>}

      <div className="space-y-2">
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add a progress update…" className="w-full px-3 py-2.5 rounded-xl bg-black/20 ring-1 ring-white/10 text-white placeholder-slate-500 text-sm min-h-[64px]" />
        <button onClick={() => { if (note.trim()) act('add_update', { body: note }).then(() => setNote('')) }} disabled={!!busy || !note.trim()} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-white text-sm disabled:opacity-50"><Send size={15} /> Send update</button>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Evidence</div>
        <div className="grid grid-cols-3 gap-2">
          <EvidenceBtn label="Before" done={before} busy={busy === 'before_photo'} onPick={f => upload(f, 'ticket-photos', 'before_photo')} />
          <EvidenceBtn label="After" done={after} busy={busy === 'after_photo'} onPick={f => upload(f, 'ticket-photos', 'after_photo')} />
          <EvidenceBtn label="COC" done={coc} busy={busy === 'coc'} onPick={f => upload(f, 'completion-docs', 'coc')} />
        </div>
      </div>
    </div>
  )
}

function EvidenceBtn({ label, done, busy, onPick }: { label: string; done: boolean; busy: boolean; onPick: (f: File) => void }) {
  return (
    <label className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border cursor-pointer text-xs ${done ? 'border-emerald-500/40 text-emerald-400' : 'border-[var(--border)] text-[var(--text)]'}`}>
      <Upload size={15} />{busy ? '…' : done ? `${label} ✓` : label}
      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f) }} />
    </label>
  )
}
