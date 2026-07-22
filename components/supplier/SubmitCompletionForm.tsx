'use client'

// Submit COC & POC for sign-off (matches the agreed design). COC document is
// optional (PDF/Word, ≤20 MB); POC completion photos are required (min 2, max
// 10) via Browse / Take Photo / drag-&-drop. Uploads evidence then submits for
// sign-off.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud, Upload, ImagePlus, Camera, X, CheckCircle2, FileText, MessageSquare, Eye, Trash2, Info, ArrowRight } from 'lucide-react'
import { MoreMenu, MoreActionItem } from '@/components/regional/RmTicketActions'
import { TicketChat } from '@/components/chat/TicketChat'
import { uploadOne } from '@/lib/upload'
import { useScrollLock } from '@/lib/useScrollLock'
import { useFileDrop } from '@/components/ui/useFileDrop'
import { errMsg } from '@/components/ui/errMsg'

const MAX_PHOTOS = 10
const MIN_PHOTOS = 2
const COC_MAX_MB = 20
const COC_ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*,.png,.jpg,.jpeg,.webp,.heic'
const NOTES_MAX = 500

const fileExt = (name: string) => { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toUpperCase() : 'FILE' }

async function addEvidence(ticketId: string, kind: string, url: string) {
  const res = await fetch('/api/supplier/ticket-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId, action: 'add_evidence', kind, url }) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Upload failed')
}

export function SubmitCompletionForm({ ticketId, evidenceRequested = false, evidenceRequestReason = null, requireBoth = true, defaultOpen = false, onClose }: { ticketId: string; evidenceRequested?: boolean; evidenceRequestReason?: string | null; requireBoth?: boolean; defaultOpen?: boolean; onClose?: () => void }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  // "Chat with the client" (under More on an evidence request) — the job is awarded
  // by this stage, so the RM↔supplier chat exists.
  const [chatOpen, setChatOpen] = useState(false)
  const [coc, setCoc] = useState<File | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState<string | null>(null)

  const previews = useMemo(() => photos.map(f => URL.createObjectURL(f)), [photos])
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews])
  // Local object URL for the COC "Preview" link (file isn't uploaded until submit).
  const cocUrl = useMemo(() => (coc ? URL.createObjectURL(coc) : null), [coc])
  useEffect(() => () => { if (cocUrl) URL.revokeObjectURL(cocUrl) }, [cocUrl])
  useScrollLock(!!preview)

  const remaining = MAX_PHOTOS - photos.length
  function addPhotos(files: File[]) {
    setErr('')
    const imgs = files.filter(f => !f.type || f.type.startsWith('image/'))
    if (!imgs.length) return
    setPhotos(p => [...p, ...imgs].slice(0, MAX_PHOTOS))
  }
  function pickCoc(f: File | undefined) {
    setErr('')
    if (!f) return
    if (f.size > COC_MAX_MB * 1024 * 1024) { setErr(`COC must be ${COC_MAX_MB} MB or less.`); return }
    setCoc(f)
  }

  // Drag-and-drop, routed through the same handlers as the file inputs.
  const cocDrop = useFileDrop({ onFiles: files => pickCoc(files[0]), accept: COC_ACCEPT, multiple: false })
  const pocDrop = useFileDrop({ onFiles: addPhotos, accept: 'image/*', multiple: true, disabled: !remaining })

  async function submit() {
    if (requireBoth) {
      if (!coc) { setErr('Attach the Certificate of Completion (COC).'); return }
      if (photos.length < MIN_PHOTOS) { setErr(`Add at least ${MIN_PHOTOS} completion photos.`); return }
    } else if (!coc && photos.length === 0) {
      // Re-uploading after an evidence request — only the missing piece is needed.
      setErr('Attach the COC or at least one completion photo.'); return
    }
    setBusy(true); setErr('')
    try {
      if (coc) await addEvidence(ticketId, 'coc', await uploadOne(coc, 'completion-docs'))
      for (const f of photos) await addEvidence(ticketId, 'after_photo', await uploadOne(f, 'ticket-photos'))
      const res = await fetch(`/api/tickets/${ticketId}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit_completion', notes: notes || null }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Submit failed')
      // Mounted in a pop-up (onClose provided, e.g. the Today queue): close it and
      // refresh in place — don't yank the supplier to the ticket page. Standalone
      // uses (the /complete page) keep landing on the ticket.
      if (onClose) { setOpen(false); onClose(); router.refresh() }
      else { router.push(`/supplier/tickets/${ticketId}`); router.refresh() }
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  // Default view: a button. The full upload form only opens on click; Cancel returns here.
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition">
        <CheckCircle2 size={18} /> {evidenceRequested ? 'Upload more evidence' : 'Upload COC & POC'}
      </button>
    )
  }

  return (
    <>
    <div className="rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-5 sm:p-6 space-y-5">
      {/* Header: green check tile + title + subtitle */}
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-500"><CheckCircle2 size={20} /></span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-[var(--text)]">Submit completion for sign-off</h2>
          <p className="text-sm text-[var(--text-muted)]">Upload your Certificate of Compliance and Proof of Completion photos.</p>
        </div>
      </div>
      {/* Why the RM sent the completion back — mirrors the SM add-info modal. */}
      {evidenceRequested && evidenceRequestReason && (
        <div className="rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 p-3 space-y-0.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">More evidence requested</p>
          <p className="text-sm text-[var(--text)]">Your manager asked: &ldquo;{evidenceRequestReason}&rdquo;</p>
        </div>
      )}
      {!requireBoth && <p className="text-sm text-[var(--text-muted)]">Add the COC and/or completion photos — at least one is required.</p>}

      {/* COC */}
      <div>
        <label className="block text-sm font-bold text-[var(--text)]">Certificate of Compliance (COC) {requireBoth && <span className="text-red-500">*</span>}</label>
        <p className="text-xs text-[var(--text-muted)] mb-1.5">Upload a PDF, Word document or photo (max {COC_MAX_MB} MB).</p>
        {coc ? (
          <div className="rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-500/15 text-red-500"><FileText size={18} /></span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text)] truncate">{coc.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{fileExt(coc.name)} · {(coc.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <a href={cocUrl ?? undefined} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"><Eye size={15} /> Preview</a>
                <span aria-hidden className="h-4 w-px bg-[var(--border)]" />
                <button type="button" onClick={() => setCoc(null)} className="inline-flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-600"><Trash2 size={15} /> Remove</button>
              </div>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={14} /> File uploaded successfully</p>
          </div>
        ) : (
          <label {...cocDrop.dropProps}
            className={`flex flex-col items-center justify-center gap-1.5 py-8 rounded-xl border-2 border-dashed cursor-pointer transition ${cocDrop.isDragging ? 'border-blue-500 ring-2 ring-blue-500 bg-blue-500/5' : 'border-[var(--border)] hover:border-emerald-500/60'}`}>
            <UploadCloud size={26} className="text-[var(--text-faint)]" />
            <span className="text-sm text-[var(--text-muted)]">{cocDrop.isDragging ? 'Drop file here' : 'Tap to browse or drag & drop'}</span>
            <input type="file" accept={COC_ACCEPT} className="hidden" onChange={e => pickCoc(e.target.files?.[0])} />
          </label>
        )}
      </div>

      {/* POC photos (required) */}
      <div>
        <label className="block text-sm font-bold text-[var(--text)]">Proof of Completion Photos {requireBoth && <span className="text-red-500">*</span>}</label>
        <p className="text-xs text-[var(--text-muted)] mb-1.5">{requireBoth ? `Minimum ${MIN_PHOTOS} photos required, up to ${MAX_PHOTOS}.` : `Up to ${MAX_PHOTOS} photos.`}</p>
        <div {...pocDrop.dropProps}
          className={`space-y-2 rounded-xl transition ${pocDrop.isDragging ? 'outline-dashed outline-2 outline-offset-4 outline-blue-500 bg-blue-500/5' : ''}`}>
          <div className="grid grid-cols-2 gap-2">
            <label className={`flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-[var(--border)] text-sm font-medium text-[var(--text)] transition ${remaining ? 'cursor-pointer hover:border-emerald-500/60 hover:bg-[var(--hover)]' : 'opacity-50 cursor-not-allowed'}`}>
              <Upload size={16} /> Browse files
              <input type="file" accept="image/*" multiple disabled={!remaining} className="hidden" onChange={e => addPhotos(Array.from(e.target.files ?? []))} />
            </label>
            <label className={`flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-[var(--border)] text-sm font-medium text-[var(--text)] transition ${remaining ? 'cursor-pointer hover:border-emerald-500/60 hover:bg-[var(--hover)]' : 'opacity-50 cursor-not-allowed'}`}>
              <Camera size={16} /> Take photo
              <input type="file" accept="image/*" capture="environment" disabled={!remaining} className="hidden" onChange={e => addPhotos(Array.from(e.target.files ?? []))} />
            </label>
          </div>

          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((f, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-[var(--border)]">
                  <button type="button" onClick={() => setPreview(previews[i])} className="block h-full w-full" title={`View ${f.name}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- ephemeral blob: preview URL */}
                    <img src={previews[i]} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                  </button>
                  <span className="absolute left-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-black/60 px-1 text-[10px] font-semibold text-white">{i + 1}</span>
                  <button type="button" onClick={() => setPhotos(p => p.filter((_, j) => j !== i))} title="Remove photo"
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-red-500">
                    <X size={13} />
                  </button>
                </div>
              ))}
              {remaining > 0 && (
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[var(--border)] text-[var(--text-faint)] transition hover:border-emerald-500/60 hover:text-[var(--text-muted)]">
                  <ImagePlus size={18} />
                  <span className="px-1 text-center text-[10px] font-medium leading-tight">Add more<br />Up to {remaining} photos</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={e => addPhotos(Array.from(e.target.files ?? []))} />
                </label>
              )}
            </div>
          )}

          {/* Count / minimum status line */}
          {photos.length > 0 && (requireBoth ? (
            photos.length >= MIN_PHOTOS
              ? <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={14} /> {photos.length} of {MAX_PHOTOS} photos added · Minimum requirement met</p>
              : <p className="text-xs text-amber-600 dark:text-amber-400">{photos.length} of {MAX_PHOTOS} photos added · minimum {MIN_PHOTOS} required</p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={14} /> {photos.length} of {MAX_PHOTOS} photos added</p>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-bold text-[var(--text)] mb-1.5">Notes for the client <span className="font-normal text-[var(--text-muted)]">(optional)</span></label>
        <div className="relative">
          <textarea maxLength={NOTES_MAX} className="w-full px-3 py-2.5 pb-7 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40" placeholder="Add any additional notes or comments…" value={notes} onChange={e => setNotes(e.target.value)} />
          <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] tabular-nums text-[var(--text-faint)]">{notes.length} / {NOTES_MAX}</span>
        </div>
      </div>

      {/* What happens next */}
      <div className="flex gap-2 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/30 p-3">
        <Info size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-[var(--text)]">The client will review this submission and the ticket will be signed off once approved.</p>
      </div>

      {err && <p className="text-sm text-red-500">{err}</p>}

      {evidenceRequested ? (
        // Evidence-request flavour: Cancel moves under "More" alongside a direct line
        // to the client who asked for the evidence.
        <div className="flex items-center gap-3">
          <button onClick={submit} disabled={busy} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Submitting…' : <>Review submission <ArrowRight size={16} /></>}</button>
          <MoreMenu up align="right">
            <MoreActionItem icon={<X size={16} />} label="Cancel" onClick={() => { setOpen(false); setErr(''); onClose?.() }} />
            <MoreActionItem icon={<MessageSquare size={16} />} label="Chat with the client" onClick={() => setChatOpen(true)} />
          </MoreMenu>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => { setOpen(false); setErr(''); onClose?.() }} disabled={busy} className="py-3 rounded-xl ring-1 ring-[var(--border)] text-[var(--text)] text-sm font-semibold disabled:opacity-50 hover:bg-[var(--hover)]">Cancel</button>
          <button onClick={submit} disabled={busy} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Submitting…' : <>Review submission <ArrowRight size={16} /></>}</button>
        </div>
      )}
    </div>

    {/* Tap-to-view lightbox */}
    {preview && (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ephemeral blob: preview URL; next/image can't optimize it */}
        <img src={preview} alt="Photo preview" className="max-h-full max-w-full rounded-lg" />
        <button type="button" onClick={() => setPreview(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" title="Close"><X size={22} /></button>
      </div>
    )}

    {/* RM↔supplier chat, opened from More → Chat with the client. */}
    {chatOpen && <TicketChat ticketId={ticketId} viewerRole="supplier" defaultOpen onClose={() => setChatOpen(false)} />}
    </>
  )
}
