'use client'

// Store-manager "add requested info" flow, shown as a pop-up. The RM asked for
// more detail; the SM writes a required note, and may attach photos and/or a
// document, then resubmits — the ticket returns to the RM marked "Info added".
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send, X, FileUp, FileText, MessageSquarePlus } from 'lucide-react'
import { uploadFiles } from '@/lib/upload'
import { PhotoUploader } from '@/components/ui/PhotoUploader'

const MAX_NEW_PHOTOS = 5
const MAX_DOCS = 5
const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf'

interface Props {
  ticketId: string
  title: string
  description: string
  category: string
  impact: string
  photoUrls: string[]
  docUrls: string[]
  requestReason?: string | null
  // Optional custom trigger (e.g. an outline button in the work queue). Receives
  // an `open` callback; when omitted the default full-width blue button is used.
  trigger?: (open: () => void) => React.ReactNode
}

export function AddInfoModal({ ticketId, title, description, category, impact, photoUrls, docUrls, requestReason, trigger }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [docs, setDocs] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => () => { previews.forEach(URL.revokeObjectURL) }, [previews])

  // Lock body scroll + close on Escape while the modal is open.
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
  function addDocs(incoming: File[]) {
    setErr('')
    setDocs(p => [...p, ...incoming.filter(f => !f.type.startsWith('image/'))].slice(0, MAX_DOCS))
  }

  async function submit() {
    if (!info.trim()) { setErr('Please describe the requested information before submitting.'); return }
    setBusy(true); setErr('')
    try {
      const [{ urls: newPhotos, failed: pf }, { urls: newDocs, failed: df }] = await Promise.all([
        files.length ? uploadFiles(files, 'ticket-photos') : Promise.resolve({ urls: [] as string[], failed: [] as string[] }),
        docs.length ? uploadFiles(docs, 'ticket-docs') : Promise.resolve({ urls: [] as string[], failed: [] as string[] }),
      ])
      if (pf.length || df.length) throw new Error(`${[...pf, ...df].length} file(s) failed to upload — check your connection and try again.`)

      const newDescription = `${description}\n\n— Added info: ${info.trim()}`
      const patch = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: newDescription, category, operational_impact: impact, photo_urls: [...photoUrls, ...newPhotos], info_doc_urls: [...docUrls, ...newDocs] }),
      })
      if (!patch.ok) throw new Error((await patch.json().catch(() => ({}))).error ?? 'Failed to save')
      const res = await fetch(`/api/tickets/${ticketId}/transition`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resubmit' }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to submit')
      setOpen(false)
      router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const field = 'w-full rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-blue-500/40'

  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500"
        >
          <MessageSquarePlus size={16} /> Add the requested info
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => { if (!busy) setOpen(false) }}
          role="dialog"
          aria-modal="true"
          aria-label="Provide the requested information"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-[var(--surface)] ring-1 ring-[var(--border)] shadow-2xl sm:rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-[var(--text)]">Provide the requested information</h2>
                {requestReason && <p className="mt-0.5 text-xs text-[var(--text-muted)]">Your manager asked: “{requestReason}”</p>}
              </div>
              <button type="button" onClick={() => { if (!busy) setOpen(false) }} className="shrink-0 rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]" title="Close">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[var(--text)]">Describe the extra information <span className="text-red-500">*</span></label>
                <textarea
                  value={info}
                  onChange={e => { setInfo(e.target.value); if (err) setErr('') }}
                  required
                  placeholder="Add the details the manager asked for…"
                  className={`${field} min-h-[110px] px-3 py-2.5`}
                />
              </div>

              <div>
                <p className="mb-1.5 text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Photos <span className="normal-case">(optional)</span></p>
                <PhotoUploader photos={files} previews={previews} onAdd={addFiles} onRemove={removeFile} max={MAX_NEW_PHOTOS} />
              </div>

              <div>
                <p className="mb-1.5 text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Documents <span className="normal-case">(optional — PDF, Word, Excel)</span></p>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-3 py-3 text-sm font-medium text-[var(--text)] transition hover:border-[#f59e0b]/60">
                  <FileUp size={16} /> Choose a document
                  <input type="file" multiple accept={DOC_ACCEPT} className="hidden" onChange={e => { addDocs(Array.from(e.target.files ?? [])); e.target.value = '' }} />
                </label>
                {docs.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {docs.map((d, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2">
                        <span className="flex min-w-0 items-center gap-2 text-sm text-[var(--text)]"><FileText size={14} className="shrink-0 text-blue-500" /> <span className="truncate">{d.name}</span></span>
                        <button type="button" onClick={() => setDocs(p => p.filter((_, j) => j !== i))} className="shrink-0 text-[var(--text-faint)] hover:text-red-500" title="Remove"><X size={14} /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {err && <p className="text-sm text-red-500">{err}</p>}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
              <button type="button" onClick={() => { if (!busy) setOpen(false) }} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)] transition hover:bg-[var(--hover)]">Cancel</button>
              <button type="button" onClick={submit} disabled={busy || !info.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50">
                <Send size={15} /> {busy ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
