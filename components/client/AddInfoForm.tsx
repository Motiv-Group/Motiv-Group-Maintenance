'use client'

// Shown on a store-manager ticket when the RM has requested more information.
// The SM adds a note (appended to the description) and/or extra photos, then
// submits — the ticket returns to the RM marked "Info added". Edit/delete are
// no longer available once the RM has acted.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Camera, X, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const MAX_NEW_PHOTOS = 5

interface Props {
  ticketId: string
  title: string
  description: string
  category: string
  impact: string
  photoUrls: string[]
}

export function AddInfoForm({ ticketId, title, description, category, impact, photoUrls }: Props) {
  const router = useRouter()
  const [info, setInfo] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const remaining = MAX_NEW_PHOTOS - files.length
  function addFiles(incoming: File[]) {
    setErr('')
    const imgs = incoming.filter(f => f.type.startsWith('image/'))
    setFiles(p => [...p, ...imgs].slice(0, MAX_NEW_PHOTOS))
  }

  async function submit() {
    if (!info.trim() && !files.length) { setErr('Add a note or a photo before submitting.'); return }
    setBusy(true); setErr('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const newUrls: string[] = []
      for (const f of files) {
        const path = `${user?.id ?? 'anon'}/${ticketId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${f.name.replace(/[^\w.\-]/g, '_')}`
        const { error: upErr } = await supabase.storage.from('ticket-photos').upload(path, f, { upsert: true })
        if (!upErr) newUrls.push(supabase.storage.from('ticket-photos').getPublicUrl(path).data.publicUrl)
      }
      const newDescription = info.trim() ? `${description}\n\n— Added info: ${info.trim()}` : description
      // Preserve title/category/impact so priority isn't reset; append note + photos.
      const patch = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: newDescription, category, operational_impact: impact, photo_urls: [...photoUrls, ...newUrls] }),
      })
      if (!patch.ok) throw new Error((await patch.json().catch(() => ({}))).error ?? 'Failed to save')
      const res = await fetch(`/api/tickets/${ticketId}/transition`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resubmit' }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to submit')
      router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-5 space-y-3">
      <p className="text-sm font-bold text-[var(--text)]">Provide the requested information</p>
      <textarea value={info} onChange={e => setInfo(e.target.value)} placeholder="Add the details the manager asked for…"
        className="w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] min-h-[90px] focus:outline-none focus:ring-2 focus:ring-[#C6A35D]/40" />

      <div className="grid grid-cols-2 gap-2">
        <label className={`flex items-center justify-center gap-2 py-2.5 rounded-lg ring-1 ring-[var(--border)] text-sm text-[var(--text)] transition ${remaining ? 'cursor-pointer hover:bg-[var(--hover)]' : 'opacity-50 cursor-not-allowed'}`}>
          <ImagePlus size={16} /> Add photos
          <input type="file" accept="image/*" multiple disabled={!remaining} className="hidden" onChange={e => addFiles(Array.from(e.target.files ?? []))} />
        </label>
        <label className={`flex items-center justify-center gap-2 py-2.5 rounded-lg ring-1 ring-[var(--border)] text-sm text-[var(--text)] transition ${remaining ? 'cursor-pointer hover:bg-[var(--hover)]' : 'opacity-50 cursor-not-allowed'}`}>
          <Camera size={16} /> Take photo
          <input type="file" accept="image/*" capture="environment" disabled={!remaining} className="hidden" onChange={e => addFiles(Array.from(e.target.files ?? []))} />
        </label>
      </div>
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-sm text-[#C6A35D] underline truncate min-w-0">{f.name}</span>
              <button type="button" onClick={() => setFiles(p => p.filter((_, j) => j !== i))} className="shrink-0 text-[var(--text-faint)] hover:text-red-500"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {err && <p className="text-sm text-red-500">{err}</p>}
      <button onClick={submit} disabled={busy} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 transition">
        <Send size={15} /> {busy ? 'Submitting…' : 'Submit'}
      </button>
    </div>
  )
}
