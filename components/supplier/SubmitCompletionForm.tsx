'use client'

// Submit COC & POC for sign-off (matches the agreed design). COC document is
// optional (PDF/Word, ≤20 MB); POC completion photos are required (min 2, max
// 10) via Browse / Take Photo / drag-&-drop. Uploads evidence then submits for
// sign-off.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud, ImagePlus, Camera, X, CheckCircle2, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const MAX_PHOTOS = 10
const MIN_PHOTOS = 2
const COC_MAX_MB = 20
const COC_ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

async function uploadTo(bucket: string, ticketId: string, file: File): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const path = `${user?.id}/${ticketId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name.replace(/[^\w.\-]/g, '_')}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) throw error
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
async function addEvidence(ticketId: string, kind: string, url: string) {
  const res = await fetch('/api/supplier/ticket-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId, action: 'add_evidence', kind, url }) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Upload failed')
}

export function SubmitCompletionForm({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [coc, setCoc] = useState<File | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [dragPoc, setDragPoc] = useState(false)
  const [dragCoc, setDragCoc] = useState(false)

  const previews = useMemo(() => photos.map(f => URL.createObjectURL(f)), [photos])
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews])

  const remaining = MAX_PHOTOS - photos.length
  function addPhotos(files: File[]) {
    setErr('')
    const imgs = files.filter(f => f.type.startsWith('image/'))
    if (!imgs.length) return
    setPhotos(p => [...p, ...imgs].slice(0, MAX_PHOTOS))
  }
  function pickCoc(f: File | undefined) {
    setErr('')
    if (!f) return
    if (f.size > COC_MAX_MB * 1024 * 1024) { setErr(`COC must be ${COC_MAX_MB} MB or less.`); return }
    setCoc(f)
  }

  async function submit() {
    if (!coc) { setErr('Attach the Certificate of Completion (COC).'); return }
    if (photos.length < MIN_PHOTOS) { setErr(`Add at least ${MIN_PHOTOS} completion photos.`); return }
    if (!notes.trim()) { setErr('Add notes for the regional manager.'); return }
    setBusy(true); setErr('')
    try {
      await addEvidence(ticketId, 'coc', await uploadTo('completion-docs', ticketId, coc))
      for (const f of photos) await addEvidence(ticketId, 'after_photo', await uploadTo('ticket-photos', ticketId, f))
      const res = await fetch(`/api/tickets/${ticketId}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit_completion', notes: notes || null }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Submit failed')
      router.push(`/supplier/tickets/${ticketId}`); router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-5 sm:p-6 space-y-5">
      <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--text)]"><CheckCircle2 size={20} className="text-emerald-500" /> Submit COC &amp; POC for Sign-off</h2>

      {/* COC (optional) */}
      <div>
        <label className="block text-sm font-bold text-[var(--text)] mb-1.5">Certificate of Completion (COC) <span className="text-red-500">*</span> <span className="font-normal text-[var(--text-muted)]">(PDF or Word)</span></label>
        {coc ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)]">
            <FileText size={18} className="text-[#C6A35D] shrink-0" />
            <span className="text-sm text-[var(--text)] truncate flex-1">{coc.name}</span>
            <span className="text-xs text-[var(--text-faint)] shrink-0">{(coc.size / 1024 / 1024).toFixed(1)} MB</span>
            <button type="button" onClick={() => setCoc(null)} className="p-1 text-[var(--text-faint)] hover:text-red-500"><X size={16} /></button>
          </div>
        ) : (
          <label onDragOver={e => { e.preventDefault(); setDragCoc(true) }} onDragLeave={() => setDragCoc(false)} onDrop={e => { e.preventDefault(); setDragCoc(false); pickCoc(e.dataTransfer.files?.[0]) }}
            className={`flex flex-col items-center justify-center gap-1.5 py-8 rounded-xl border-2 border-dashed cursor-pointer transition ${dragCoc ? 'border-[#C6A35D] bg-[#C6A35D]/5' : 'border-[var(--border)] hover:border-[#C6A35D]/50'}`}>
            <UploadCloud size={26} className="text-[var(--text-faint)]" />
            <span className="text-sm text-[var(--text-muted)]">PDF or Word up to {COC_MAX_MB} MB</span>
            <input type="file" accept={COC_ACCEPT} className="hidden" onChange={e => pickCoc(e.target.files?.[0])} />
          </label>
        )}
      </div>

      {/* POC photos (required) */}
      <div>
        <label className="block text-sm font-bold text-[var(--text)] mb-1.5">Proof of Completion (POC) Photos <span className="text-red-500">*</span> <span className="font-normal text-[var(--text-muted)]">(minimum {MIN_PHOTOS}, up to {MAX_PHOTOS})</span></label>
        <div onDragOver={e => { e.preventDefault(); setDragPoc(true) }} onDragLeave={() => setDragPoc(false)} onDrop={e => { e.preventDefault(); setDragPoc(false); addPhotos(Array.from(e.dataTransfer.files ?? [])) }}
          className={`rounded-xl border-2 border-dashed p-3 transition ${dragPoc ? 'border-[#C6A35D] bg-[#C6A35D]/5' : 'border-[var(--border)]'}`}>
          <div className="grid grid-cols-2 gap-2">
            <label className={`flex items-center justify-center gap-2 py-3 rounded-lg ring-1 ring-[var(--border)] text-sm text-[var(--text)] transition ${remaining ? 'cursor-pointer hover:border-[#C6A35D] hover:bg-[var(--hover)]' : 'opacity-50 cursor-not-allowed'}`}>
              <ImagePlus size={16} /> Browse
              <input type="file" accept="image/*" multiple disabled={!remaining} className="hidden" onChange={e => addPhotos(Array.from(e.target.files ?? []))} />
            </label>
            <label className={`flex items-center justify-center gap-2 py-3 rounded-lg ring-1 ring-[var(--border)] text-sm text-[var(--text)] transition ${remaining ? 'cursor-pointer hover:border-[#C6A35D] hover:bg-[var(--hover)]' : 'opacity-50 cursor-not-allowed'}`}>
              <Camera size={16} /> Take Photo
              <input type="file" accept="image/*" capture="environment" disabled={!remaining} className="hidden" onChange={e => addPhotos(Array.from(e.target.files ?? []))} />
            </label>
          </div>
          <p className="text-[11px] text-[var(--text-faint)] text-center mt-2">{remaining} of {MAX_PHOTOS} slots remaining · drag &amp; drop also works</p>

          {photos.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-3">
              {photos.map((f, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden ring-1 ring-[var(--border)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previews[i]} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setPhotos(p => p.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-bold text-[var(--text)] mb-1.5">Notes <span className="text-red-500">*</span></label>
        <textarea className="w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] min-h-[80px]" placeholder="Notes for the regional manager…" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      {err && <p className="text-sm text-red-500">{err}</p>}

      <div className="grid grid-cols-2 gap-3">
        <button onClick={submit} disabled={busy} className="py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Submitting…' : 'Review & Submit'}</button>
        <button onClick={() => router.push(`/supplier/tickets/${ticketId}`)} disabled={busy} className="py-3 rounded-xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm font-semibold disabled:opacity-50 hover:bg-[var(--hover)]">Cancel</button>
      </div>
    </div>
  )
}
