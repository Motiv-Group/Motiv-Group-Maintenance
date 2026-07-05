'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BackLink } from '@/components/ui/BackLink'
import { PlusCircle, ImagePlus, Camera, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/exec/ui'
import { OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'

const CATEGORIES = ['Electrical', 'Plumbing', 'HVAC', 'Refrigeration', 'Gas', 'Structural', 'Shopfront', 'General', 'Cleaning', 'Other']
const IMPACTS = Object.entries(OPERATIONAL_IMPACT_LABELS).map(([v, label]) => ({ v, label }))
const MAX_PHOTOS = 5

export default function LogTicketPage() {
  const router = useRouter()
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [impact, setImpact] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Object URLs for thumbnails; revoked when the file list changes / unmounts.
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => { previews.forEach(u => URL.revokeObjectURL(u)) }, [previews])

  const remaining = Math.max(0, MAX_PHOTOS - files.length)
  function addFiles(incoming: File[]) {
    const imgs = incoming.filter(f => f.type.startsWith('image/'))
    setFiles(prev => [...prev, ...imgs].slice(0, MAX_PHOTOS))
  }

  // Raised slate field on the card, green focus accent — matches the design.
  const input = 'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!category || !impact || !description.trim()) { setError('Please complete every field.'); return }
    if (files.length < 2) { setError('Please add at least 2 photos of the issue.'); return }
    setLoading(true); setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const photo_urls: string[] = []
      for (const f of files) {
        const path = `${user?.id ?? 'anon'}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, '_')}`
        const { error: upErr } = await supabase.storage.from('ticket-photos').upload(path, f, { upsert: true })
        if (!upErr) photo_urls.push(supabase.storage.from('ticket-photos').getPublicUrl(path).data.publicUrl)
      }
      const res = await fetch('/api/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: category, description, category, operational_impact: impact, photo_urls }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Failed to log ticket') }
      router.push('/client/tickets'); router.refresh()
    } catch (e: any) { setError(e.message ?? 'Failed'); setLoading(false) }
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <BackLink fallbackHref="/client/tickets" label="Back to tickets" />

      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><PlusCircle className="text-emerald-500" size={22} /> Log a Ticket</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Describe the maintenance issue at your store. All fields are required.</p></div>

      <Card className="p-5 sm:p-6">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Category" required>
            <select className={input} value={category} onChange={e => setCategory(e.target.value)} required>
              <option value="" disabled>Select a category…</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          {/* Full-width so the longest impact labels (e.g. "Store cannot trade") fit on phones. */}
          <Field label="Operational Impact" required>
            <select className={input} value={impact} onChange={e => setImpact(e.target.value)} required>
              <option value="" disabled>Select operational impact…</option>
              {IMPACTS.map(i => <option key={i.v} value={i.v}>{i.label}</option>)}
            </select>
          </Field>

          <Field label="Description" required><textarea className={`${input} min-h-[110px]`} value={description} onChange={e => setDescription(e.target.value)} placeholder="What's wrong, where, since when…" required /></Field>

          <Field label="Photos" required hint="(minimum 2, up to 5)">
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)) }}
              className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-3"
            >
              <div className="grid grid-cols-2 gap-3">
                {/* Browse — pick existing images */}
                <label className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[var(--text)] text-sm font-medium transition ${remaining ? 'cursor-pointer hover:border-emerald-500/60' : 'opacity-50 cursor-not-allowed'}`}>
                  <ImagePlus size={16} /> Browse
                  <input type="file" accept="image/*" multiple disabled={!remaining} className="hidden" onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
                </label>
                {/* Take Photo — opens the device camera on phones (capture) */}
                <label className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[var(--text)] text-sm font-medium transition ${remaining ? 'cursor-pointer hover:border-emerald-500/60' : 'opacity-50 cursor-not-allowed'}`}>
                  <Camera size={16} /> Take Photo
                  <input type="file" accept="image/*" capture="environment" disabled={!remaining} className="hidden" onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
                </label>
              </div>
              <p className="text-center text-[11px] text-[var(--text-faint)] mt-2.5">{remaining} of {MAX_PHOTOS} slots remaining · drag &amp; drop also works</p>

              {files.length > 0 && (
                <div className="mt-3 space-y-1">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => setPreview(previews[i])} className="text-sm text-[#C6A35D] underline truncate min-w-0 text-left" title={`View ${f.name}`}>Photo {i + 1} — {f.name}</button>
                      <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="shrink-0 text-[var(--text-faint)] hover:text-red-500" title="Remove"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Field>

          {error && <div className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>}
          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition disabled:opacity-60">{loading ? 'Logging…' : 'Submit Ticket'}</button>
        </form>
      </Card>

      {/* Tap-to-view lightbox */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ephemeral blob: preview URL; next/image can't optimize it */}
          <img src={preview} alt="Photo preview" className="max-h-full max-w-full rounded-lg" />
          <button type="button" onClick={() => setPreview(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" title="Close"><X size={22} /></button>
        </div>
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
