'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusCircle, Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'

const CATEGORIES = ['Electrical', 'Plumbing', 'HVAC', 'Refrigeration', 'Gas', 'Structural', 'General', 'Cleaning', 'Other']
const IMPACTS = Object.entries(OPERATIONAL_IMPACT_LABELS).map(([v, label]) => ({ v, label }))

export default function LogTicketPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
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

  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-[#C6A35D]/50'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !category || !impact || !description.trim()) { setError('Please complete every field.'); return }
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
        body: JSON.stringify({ title, description, category, operational_impact: impact, photo_urls }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Failed to log ticket') }
      router.push('/client/tickets'); router.refresh()
    } catch (e: any) { setError(e.message ?? 'Failed'); setLoading(false) }
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><PlusCircle className="text-emerald-500" size={22} /> Log a Ticket</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Describe the maintenance issue at your store. All fields are required.</p></div>

      <form onSubmit={submit} className="space-y-4">
        <Field label="Title"><input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Aircon not cooling" required /></Field>

        <Field label="Category">
          <select className={input} value={category} onChange={e => setCategory(e.target.value)} required>
            <option value="" disabled>Select a category…</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        {/* Full-width so the longest impact labels (e.g. "Store cannot trade") fit on phones. */}
        <Field label="Operational Impact">
          <select className={input} value={impact} onChange={e => setImpact(e.target.value)} required>
            <option value="" disabled>Select operational impact…</option>
            {IMPACTS.map(i => <option key={i.v} value={i.v}>{i.label}</option>)}
          </select>
        </Field>

        <Field label="Description"><textarea className={`${input} min-h-[110px]`} value={description} onChange={e => setDescription(e.target.value)} placeholder="What's wrong, where, since when…" required /></Field>

        <Field label={`Photos (min 2) — ${files.length} added`}>
          <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--input-bg)] border border-dashed border-[var(--border)] text-[var(--text-muted)] cursor-pointer hover:border-[#C6A35D]/50">
            <Upload size={16} /> Add photos
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
          </label>
          {files.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
              {files.map((f, i) => (
                <div key={i} className="relative">
                  <button type="button" onClick={() => setPreview(previews[i])} className="block w-full aspect-square rounded-lg overflow-hidden ring-1 ring-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[#C6A35D]/50" title={`View ${f.name}`}>
                    <img src={previews[i]} alt={f.name} className="w-full h-full object-cover" />
                  </button>
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow" title="Remove">
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Field>

        {error && <div className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>}
        <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 transition disabled:opacity-60">{loading ? 'Logging…' : 'Submit Ticket'}</button>
      </form>

      {/* Tap-to-view lightbox */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <img src={preview} alt="Photo preview" className="max-h-full max-w-full rounded-lg" />
          <button type="button" onClick={() => setPreview(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" title="Close"><X size={22} /></button>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-[var(--text-muted)] mb-1">{label}</label>{children}</div>
}
