'use client'

// Supplier progress updates: free-text, quick presets, and progress photos the
// supplier sends while on the job. (COC/POC evidence is captured separately in
// the Submit COC & POC form.) Posts to /api/supplier/ticket-action.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Camera, Check } from 'lucide-react'
import { uploadOne } from '@/lib/upload'

const PRESETS = ['On my way', 'On site', 'Parts ordered', 'Delayed']

export function SupplierAttachments({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  // Key of the update just sent — drives the transient "Sent ✓" confirmation so a
  // quick preset tap doesn't feel like nothing happened. Cleared after a moment.
  const [sent, setSent] = useState<string | null>(null)

  async function addUpdate(text: string, key: string) {
    if (!text.trim()) return
    setBusy(key); setErr('')
    try {
      const res = await fetch('/api/supplier/ticket-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId, action: 'add_update', body: text }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      setSent(key); setTimeout(() => setSent(s => (s === key ? null : s)), 2500)
      router.refresh()
    } catch (e: any) { setErr(e.message) } finally { setBusy(null) }
  }

  async function uploadPhoto(file: File) {
    setBusy('photo'); setErr('')
    try {
      const url = await uploadOne(file, 'ticket-photos')
      await addUpdate(`📷 Progress photo: ${url}`, 'photo')
    } catch (e: any) { setErr(e.message); setBusy(null) }
  }

  return (
    <div className="space-y-3">
      {err && <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{err}</div>}
      {/* Transient confirmation so a preset/note tap gives visible feedback. */}
      {sent && (
        <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/30 rounded-lg px-3 py-2">
          <Check size={15} className="shrink-0" /> Update sent
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {PRESETS.map(p => {
          const isSent = sent === p
          return (
            <button key={p} onClick={() => addUpdate(p, p)} disabled={!!busy}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ring-1 disabled:opacity-50 transition inline-flex items-center gap-1.5 ${isSent ? 'ring-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'ring-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)]'}`}>
              {busy === p ? '…' : isSent ? <><Check size={13} className="shrink-0" /> Sent</> : p}
            </button>
          )
        })}
      </div>

      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add a progress update…"
        className="w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] placeholder-[var(--text-faint)] text-sm min-h-[64px]" />

      <div className="flex gap-2">
        <button onClick={() => addUpdate(note, 'note').then(() => setNote(''))} disabled={!!busy || !note.trim()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#C6A35D] text-[#0a0e17] text-sm font-semibold disabled:opacity-50"><Send size={15} /> Send update</button>
        <label className="flex items-center gap-2 px-3 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text)] text-sm cursor-pointer hover:bg-[var(--hover)] transition">
          <Camera size={15} /> {busy === 'photo' ? 'Uploading…' : 'Add photo'}
          <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f) }} />
        </label>
      </div>
    </div>
  )
}
