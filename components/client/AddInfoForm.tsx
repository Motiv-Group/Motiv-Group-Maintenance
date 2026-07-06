'use client'

// Shown on a store-manager ticket when the RM has requested more information.
// The SM must add a note (appended to the description) and may attach extra
// photos, then submits — the ticket returns to the RM marked "Info added".
// Edit/delete are no longer available once the RM has acted.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { uploadFiles } from '@/lib/upload'
import { PhotoUploader } from '@/components/ui/PhotoUploader'

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
  const [previews, setPreviews] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Revoke object URLs on unmount so we don't leak blob references.
  useEffect(() => () => { previews.forEach(URL.revokeObjectURL) }, [previews])

  function addFiles(incoming: File[]) {
    setErr('')
    const imgs = incoming.filter(f => f.type.startsWith('image/'))
    setFiles(p => [...p, ...imgs].slice(0, MAX_NEW_PHOTOS))
    setPreviews(p => [...p, ...imgs.map(f => URL.createObjectURL(f))].slice(0, MAX_NEW_PHOTOS))
  }
  function removeFile(i: number) {
    setPreviews(p => { const u = p[i]; if (u) URL.revokeObjectURL(u); return p.filter((_, j) => j !== i) })
    setFiles(p => p.filter((_, j) => j !== i))
  }

  async function submit() {
    // The note is required; photos are optional.
    if (!info.trim()) { setErr('Please describe the requested information before submitting.'); return }
    setBusy(true); setErr('')
    try {
      const { urls: newUrls } = await uploadFiles(files, 'ticket-photos')
      const newDescription = `${description}\n\n— Added info: ${info.trim()}`
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
      <p className="text-sm font-bold text-[var(--text)]">Provide the requested information <span className="text-red-500">*</span></p>
      <textarea value={info} onChange={e => { setInfo(e.target.value); if (err) setErr('') }} required placeholder="Add the details the manager asked for…"
        className="w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] min-h-[90px] focus:outline-none focus:ring-2 focus:ring-[#C6A35D]/40" />

      <div>
        <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Add photos <span className="normal-case">(optional)</span></p>
        <PhotoUploader photos={files} previews={previews} onAdd={addFiles} onRemove={removeFile} max={MAX_NEW_PHOTOS} />
      </div>

      {err && <p className="text-sm text-red-500">{err}</p>}
      <button onClick={submit} disabled={busy} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 transition">
        <Send size={15} /> {busy ? 'Submitting…' : 'Submit'}
      </button>
    </div>
  )
}
