'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BackLink } from '@/components/ui/BackLink'
import { PlusCircle, ImagePlus, Camera, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { uploadTicketPhotos } from '@/lib/upload'
import { Card } from '@/components/exec/ui'
import { Modal } from '@/components/ui/Modal'
import { OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'

const CATEGORIES = ['Electrical', 'Plumbing', 'HVAC', 'Refrigeration', 'Gas', 'Structural', 'Appliances', 'Painting', 'General', 'Cleaning', 'Other']
const IMPACTS = Object.entries(OPERATIONAL_IMPACT_LABELS).map(([v, label]) => ({ v, label }))
const MAX_PHOTOS = 5

export default function LogJobPage() {
  const router = useRouter()
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [impact, setImpact] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => { previews.forEach(u => URL.revokeObjectURL(u)) }, [previews])

  const remaining = Math.max(0, MAX_PHOTOS - files.length)
  function addFiles(incoming: File[]) {
    const imgs = incoming.filter(f => !f.type || f.type.startsWith('image/'))
    setFiles(prev => [...prev, ...imgs].slice(0, MAX_PHOTOS))
  }

  const input = 'w-full px-3.5 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!category || !impact || !description.trim()) { setError('Please complete every field.'); return }
    if (files.length < 2) { setError('Please add at least 2 photos of the issue.'); return }
    setLoading(true); setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      // Parallel upload; a failed photo BLOCKS submit instead of being silently dropped.
      const { urls: photo_urls, failed } = await uploadTicketPhotos(files, user?.id)
      if (failed.length) { setError(`${failed.length} photo${failed.length === 1 ? '' : 's'} failed to upload (${failed.join(', ')}) — check your connection and try again.`); setLoading(false); return }
      // No title field — the API auto-composes "Category — first words of description".
      const res = await fetch('/api/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, category, operational_impact: impact, photo_urls }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Failed to log job') }
      router.push('/individual/tickets'); router.refresh()
    } catch (e: any) { setError(e.message ?? 'Failed'); setLoading(false) }
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <BackLink fallbackHref="/individual/tickets" label="Back to jobs" />

      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><PlusCircle className="text-emerald-500" size={22} /> Log a Job</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Describe the maintenance issue. All fields are required.</p></div>

      <Card className="p-5 sm:p-6">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Category" required>
            <select className={input} value={category} onChange={e => setCategory(e.target.value)} required>
              <option value="" disabled>Select a category…</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="Urgency / Impact" required>
            <select className={input} value={impact} onChange={e => setImpact(e.target.value)} required>
              <option value="" disabled>Select how urgent it is…</option>
              {IMPACTS.map(i => <option key={i.v} value={i.v}>{i.label}</option>)}
            </select>
          </Field>

          <Field label="Description" required><textarea className={`${input} min-h-[110px]`} value={description} onChange={e => setDescription(e.target.value)} placeholder="What's wrong, where, since when…" required /></Field>

          <Field label="Photos" required hint="(minimum 2, up to 5)">
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)) }}
              className="rounded-xl border border-dashed border-[var(--border)] p-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <label className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text)] text-sm font-medium transition ${remaining ? 'cursor-pointer hover:border-emerald-500/60' : 'opacity-50 cursor-not-allowed'}`}>
                  <ImagePlus size={16} /> Browse
                  <input type="file" accept="image/*" multiple disabled={!remaining} className="hidden" onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
                </label>
                <label className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text)] text-sm font-medium transition ${remaining ? 'cursor-pointer hover:border-emerald-500/60' : 'opacity-50 cursor-not-allowed'}`}>
                  <Camera size={16} /> Take Photo
                  <input type="file" accept="image/*" capture="environment" disabled={!remaining} className="hidden" onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
                </label>
              </div>
              <p className="text-center text-[11px] text-[var(--text-faint)] mt-2.5">{remaining} of {MAX_PHOTOS} slots remaining · drag &amp; drop also works</p>

              {files.length > 0 && (
                <div className="mt-3 space-y-1">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => setPreview(previews[i])} className="text-sm text-[#f59e0b] underline truncate min-w-0 text-left" title={`View ${f.name}`}>Photo {i + 1} — {f.name}</button>
                      <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="shrink-0 text-[var(--text-faint)] hover:text-red-500" title="Remove"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Field>

          {error && <div className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>}
          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition disabled:opacity-60">{loading ? 'Logging…' : 'Submit Job'}</button>
        </form>
      </Card>

      {preview && (
        <Modal onClose={() => setPreview(null)} maxWidth="max-w-2xl">
          {close => (
            <>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-[var(--text)]">Photo preview</h3>
                <button type="button" onClick={close} aria-label="Close" className="-m-1 rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"><X size={18} /></button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- ephemeral blob: preview URL; next/image can't optimize it */}
              <img src={preview} alt="Photo preview" className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg" />
            </>
          )}
        </Modal>
      )}
    </div>
  )
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
        {label}{required && <span className="text-red-500"> *</span>}
        {hint && <span className="text-[var(--text-faint)] font-normal"> {hint}</span>}
      </label>
      {children}
    </div>
  )
}
