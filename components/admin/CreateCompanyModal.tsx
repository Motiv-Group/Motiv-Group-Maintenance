'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, ImagePlus, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { errMsg } from '@/components/ui/errMsg'

function revoke(url: string | null) { if (url) URL.revokeObjectURL(url) }

const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60'

// "Create company" pop-up: company name + optional logo. Creates the company,
// then (if a logo was chosen) uploads it and stores the URL. People are added
// afterwards from the company's card on the Accounts page.
export function CreateCompanyModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<string | null>(null)

  // Revoke the last object URL on unmount (no setState — lint-safe).
  useEffect(() => () => revoke(previewRef.current), [])

  function setPreviewUrl(url: string | null) { revoke(previewRef.current); previewRef.current = url; setPreview(url) }

  function pickFile(f: File | undefined) {
    if (!f) return
    // Android WebView often reports an empty MIME type — accept it (the picker
    // already limits to images) rather than silently dropping the file.
    if (f.type && !f.type.startsWith('image/')) { setErr('Logo must be an image.'); return }
    if (f.size > 8 * 1024 * 1024) { setErr('Logo is over 8MB.'); return }
    setErr(''); setFile(f); setPreviewUrl(URL.createObjectURL(f))
  }

  function clearFile() { setFile(null); setPreviewUrl(null) }

  async function submit(close: () => void, e: React.FormEvent) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) { setErr('Company name is required.'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_company', companyName: clean }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not create company.')
      if (file && data.companyId) {
        const fd = new FormData()
        fd.append('companyId', data.companyId)
        fd.append('file', file)
        const up = await fetch('/api/admin/companies/logo', { method: 'POST', body: fd })
        if (!up.ok) {
          // Company was created; only the logo failed — don't lose the company.
          const upData = await up.json().catch(() => ({}))
          setErr(`Company created, but the logo failed: ${upData.error ?? 'upload error'}.`)
          router.refresh()
          return
        }
      }
      router.refresh()
      close()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <Modal onClose={onClose}>
      {close => (
        <form onSubmit={e => submit(close, e)} className="space-y-4">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-bold text-[var(--text)]">Create company</h2>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Company / Estate name <span className="text-red-500">*</span></label>
            <input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="Acme Group" autoFocus required />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Logo (optional)</label>
            <div className="flex items-center gap-3">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not a remote asset
                <img src={preview} alt="Logo preview" className="h-14 w-14 rounded-xl object-cover ring-1 ring-[var(--border)] bg-white" />
              ) : (
                <span className="grid h-14 w-14 place-items-center rounded-xl ring-1 ring-dashed ring-[var(--border)] text-[var(--text-faint)]"><ImagePlus size={20} /></span>
              )}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-xl ring-1 ring-[var(--border)] text-sm text-[var(--text)] hover:bg-[var(--hover)] transition">
                  {file ? 'Change' : 'Upload logo'}
                </button>
                {file && (
                  <button type="button" onClick={clearFile} className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"><X size={13} /> Remove</button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
            </div>
            <p className="mt-1 text-[11px] text-[var(--text-faint)]">PNG, JPEG or WebP · up to 8MB · squared automatically.</p>
          </div>

          {err && <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{err}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={close} className="flex-1 py-2.5 rounded-xl ring-1 ring-[var(--border)] text-sm font-semibold text-[var(--text)] hover:bg-[var(--hover)] transition">Cancel</button>
            <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition disabled:opacity-50">
              {busy ? 'Creating…' : 'Create company'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
