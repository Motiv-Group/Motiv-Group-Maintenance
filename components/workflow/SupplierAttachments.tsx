'use client'

// Supplier progress updates: free-text, quick presets, and progress photos the
// supplier sends while on the job. (COC/POC evidence is captured separately in
// the Submit COC & POC form.) Posts to /api/supplier/ticket-action.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Camera } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const PRESETS = ['On my way', 'On site', 'Parts ordered', 'Delayed']

export function SupplierAttachments({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')

  async function addUpdate(text: string, key: string) {
    if (!text.trim()) return
    setBusy(key); setErr('')
    try {
      const res = await fetch('/api/supplier/ticket-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId, action: 'add_update', body: text }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      router.refresh()
    } catch (e: any) { setErr(e.message) } finally { setBusy(null) }
  }

  async function uploadPhoto(file: File) {
    setBusy('photo'); setErr('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const path = `${user?.id}/${ticketId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const { error } = await supabase.storage.from('ticket-photos').upload(path, file, { upsert: true })
      if (error) throw error
      const url = supabase.storage.from('ticket-photos').getPublicUrl(path).data.publicUrl
      await addUpdate(`📷 Progress photo: ${url}`, 'photo')
    } catch (e: any) { setErr(e.message); setBusy(null) }
  }

  return (
    <div className="space-y-3">
      {err && <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{err}</div>}

      <div className="flex flex-wrap gap-2">
        {PRESETS.map(p => (
          <button key={p} onClick={() => addUpdate(p, p)} disabled={!!busy}
            className="px-3 py-1.5 rounded-full text-xs font-medium ring-1 ring-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)] disabled:opacity-50 transition">
            {busy === p ? '…' : p}
          </button>
        ))}
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
