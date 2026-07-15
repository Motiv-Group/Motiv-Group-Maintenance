'use client'

// Store-manager "Edit ticket" flow shown as a pop-up (matches AddInfoModal).
// While a ticket is still open the SM can correct the details (title, category,
// operational impact, description) and attach more photos, then save. Priority
// is re-derived from the operational impact server-side.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X, Save } from 'lucide-react'
import { uploadFiles } from '@/lib/upload'
import { PhotoUploader } from '@/components/ui/PhotoUploader'

const CATEGORIES = ['Electrical', 'Plumbing', 'HVAC', 'Refrigeration', 'Gas', 'Structural', 'General', 'Cleaning', 'Other']
const IMPACTS: { v: string; label: string }[] = [
  { v: 'none', label: 'No operational impact' },
  { v: 'cosmetic', label: 'Cosmetic / minor' },
  { v: 'customer_visible', label: 'Customer-visible' },
  { v: 'staff_inconvenience', label: 'Staff inconvenience' },
  { v: 'trading_affected', label: 'Trading affected' },
  { v: 'safety_risk', label: 'Safety risk' },
  { v: 'cannot_trade', label: 'Store cannot trade' },
]
const MAX_NEW_PHOTOS = 5

interface Props {
  ticketId: string
  title: string
  description: string
  category: string
  impact: string
  photoUrls: string[]
}

export function EditTicketModal({ ticketId, title: t0, description: d0, category: c0, impact: i0, photoUrls }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(t0)
  const [category, setCategory] = useState(c0 || 'General')
  const [impact, setImpact] = useState(i0 || 'none')
  const [description, setDescription] = useState(d0)
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => () => { previews.forEach(URL.revokeObjectURL) }, [previews])

  // Lock body scroll + close on Escape while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setOpen(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, busy])

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

  // Revert edits back to the saved values (and clear staged photos).
  function reset() {
    setTitle(t0); setCategory(c0 || 'General'); setImpact(i0 || 'none'); setDescription(d0)
    previews.forEach(URL.revokeObjectURL); setPreviews([]); setFiles([]); setErr('')
  }

  async function save() {
    if (!title.trim() || !description.trim()) { setErr('Title and description are required.'); return }
    setBusy(true); setErr('')
    try {
      const { urls: newPhotos, failed } = files.length
        ? await uploadFiles(files, 'ticket-photos')
        : { urls: [] as string[], failed: [] as string[] }
      if (failed.length) throw new Error(`${failed.length} photo(s) failed to upload — check your connection and try again.`)

      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), category, operational_impact: impact, photo_urls: [...photoUrls, ...newPhotos] }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to save')
      setOpen(false)
      previews.forEach(URL.revokeObjectURL); setPreviews([]); setFiles([])
      router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const field = 'w-full rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-blue-500/40'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500"
      >
        <Pencil size={16} /> Edit ticket
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => { if (!busy) setOpen(false) }}
          role="dialog"
          aria-modal="true"
          aria-label="Edit ticket"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-[var(--surface)] ring-1 ring-[var(--border)] shadow-2xl sm:rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-[var(--text)]"><Pencil size={16} /> Edit ticket</h2>
              <button type="button" onClick={() => { if (!busy) setOpen(false) }} className="shrink-0 rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]" title="Close">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Title</label>
                <input value={title} onChange={e => { setTitle(e.target.value); if (err) setErr('') }} placeholder="Title" className={`${field} px-3 py-2.5`} />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className={`${field} px-3 py-2.5`}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Operational Impact</label>
                  <select value={impact} onChange={e => setImpact(e.target.value)} className={`${field} px-3 py-2.5`}>{IMPACTS.map(i => <option key={i.v} value={i.v}>{i.label}</option>)}</select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Description</label>
                <textarea value={description} onChange={e => { setDescription(e.target.value); if (err) setErr('') }} placeholder="Description" className={`${field} min-h-[100px] px-3 py-2.5`} />
              </div>

              <div>
                <p className="mb-1.5 text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
                  Add photos <span className="normal-case">(optional)</span>
                  {photoUrls.length > 0 && <span className="normal-case text-[var(--text-muted)]"> · {photoUrls.length} already attached</span>}
                </p>
                <PhotoUploader photos={files} previews={previews} onAdd={addFiles} onRemove={removeFile} max={MAX_NEW_PHOTOS} />
              </div>

              <p className="text-[11px] text-[var(--text-faint)]">Priority is recalculated from the operational impact.</p>
              {err && <p className="text-sm text-red-500">{err}</p>}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
              <button type="button" onClick={reset} disabled={busy} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)] transition hover:bg-[var(--hover)] disabled:opacity-50">Reset</button>
              <button type="button" onClick={save} disabled={busy || !title.trim() || !description.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50">
                <Save size={15} /> {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
