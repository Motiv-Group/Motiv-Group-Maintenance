'use client'

// RM logs a ticket on behalf of a store (same intake as the SM) + a store
// selector and supplier assignment. Creates the ticket via
// /api/regional/tickets; the normal lifecycle continues from there.
// Mirrors the SM "Log a Ticket" form: category drives the title, with tiles for
// operational impact + description and the identical photo block. All fields
// are required, including the store, at least one supplier, and ≥2 photos.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Check, ChevronDown, ImagePlus, Camera, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'

const CATEGORIES = ['Electrical', 'Plumbing', 'HVAC', 'Refrigeration', 'Gas', 'Structural', 'Shopfront', 'General', 'Cleaning', 'Other']
const IMPACTS = Object.entries(OPERATIONAL_IMPACT_LABELS).map(([v, label]) => ({ v, label }))
const MAX_PHOTOS = 5

export function RmNewTicketForm({ stores, suppliers }: { stores: { id: string; name: string }[]; suppliers: { id: string; name: string }[] }) {
  const router = useRouter()
  const [storeId, setStoreId] = useState('')
  const [category, setCategory] = useState('')
  const [impact, setImpact] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Object URLs for thumbnails; revoked when the file list changes / unmounts.
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => { previews.forEach(u => URL.revokeObjectURL(u)) }, [previews])
  const remaining = Math.max(0, MAX_PHOTOS - files.length)
  function addFiles(incoming: File[]) {
    const imgs = incoming.filter(f => f.type.startsWith('image/'))
    setFiles(prev => [...prev, ...imgs].slice(0, MAX_PHOTOS))
  }

  const storeName = stores.find(s => s.id === storeId)?.name ?? ''
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Raised slate field on the card, emerald focus accent — matches the SM form.
  const input = 'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!storeId) { setErr('Please select a store.'); return }
    if (!category || !impact || !description.trim()) { setErr('Please complete every field.'); return }
    if (sel.size < 1) { setErr('Please select at least one supplier.'); return }
    if (files.length < 2) { setErr('Please add at least 2 photos of the issue.'); return }
    setBusy(true); setErr('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const photo_urls: string[] = []
      for (const f of files) {
        const path = `${user?.id ?? 'anon'}/new/${Date.now()}-${f.name.replace(/[^\w.\-]/g, '_')}`
        const { error } = await supabase.storage.from('ticket-photos').upload(path, f, { upsert: true })
        if (!error) photo_urls.push(supabase.storage.from('ticket-photos').getPublicUrl(path).data.publicUrl)
      }
      const res = await fetch('/api/regional/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, title: category, description, category, operational_impact: impact, photo_urls, supplierIds: [...sel] }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to create ticket')
      router.push('/regional/tickets'); router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Store — searchable dropdown, selected pinned to the top */}
      <Field label="Store" required>
        <SelectDropdown
          placeholder="Select a store…"
          selectedLabel={storeName}
          items={stores}
          isSelected={s => s.id === storeId}
          onPick={s => setStoreId(s.id)}
          closeOnPick
        />
      </Field>

      {/* Category — drives the ticket title */}
      <Field label="Category" required>
        <select className={input} value={category} onChange={e => setCategory(e.target.value)} required>
          <option value="" disabled>Select a category…</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>

      <Field label="Operational Impact" required>
        <select className={input} value={impact} onChange={e => setImpact(e.target.value)} required>
          <option value="" disabled>Select operational impact…</option>
          {IMPACTS.map(i => <option key={i.v} value={i.v}>{i.label}</option>)}
        </select>
      </Field>

      <Field label="Description" required>
        <textarea className={`${input} min-h-[110px]`} value={description} onChange={e => setDescription(e.target.value)} placeholder="What's wrong, where, since when…" required />
      </Field>

      {/* Photos — identical to the SM log-a-ticket block */}
      <Field label="Photos" required hint="(minimum 2, up to 5)">
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)) }}
          className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <label className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[var(--text)] text-sm font-medium transition ${remaining ? 'cursor-pointer hover:border-emerald-500/60' : 'opacity-50 cursor-not-allowed'}`}>
              <ImagePlus size={16} /> Browse
              <input type="file" accept="image/*" multiple disabled={!remaining} className="hidden" onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
            </label>
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

      {/* Suppliers — searchable dropdown with checkboxes, selected pinned to the top */}
      <Field label="Assign suppliers to quote" required>
        <SelectDropdown
          placeholder="Select suppliers…"
          selectedLabel={sel.size ? `${sel.size} supplier${sel.size > 1 ? 's' : ''} selected` : ''}
          items={suppliers}
          multi
          isSelected={s => sel.has(s.id)}
          onPick={s => toggle(s.id)}
        />
      </Field>

      {err && <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{err}</p>}
      <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition disabled:opacity-60">{busy ? 'Logging…' : 'Submit Ticket'}</button>

      {/* Tap-to-view lightbox */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <img src={preview} alt="Photo preview" className="max-h-full max-w-full rounded-lg" />
          <button type="button" onClick={() => setPreview(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" title="Close"><X size={22} /></button>
        </div>
      )}
    </form>
  )
}

/** Dropdown that opens to a searchable list; selected items pin to the top.
 *  `multi` keeps it open and renders checkboxes; single-select can close on pick. */
function SelectDropdown({ placeholder, selectedLabel, items, isSelected, onPick, multi = false, closeOnPick = false }: {
  placeholder: string
  selectedLabel: string
  items: { id: string; name: string }[]
  isSelected: (s: { id: string; name: string }) => boolean
  onPick: (s: { id: string; name: string }) => void
  multi?: boolean
  closeOnPick?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return [...items]
      .filter(s => !term || s.name.toLowerCase().includes(term))
      // Selected pinned to the top, then alphabetical.
      .sort((a, b) => (isSelected(b) ? 1 : 0) - (isSelected(a) ? 1 : 0) || a.name.localeCompare(b.name))
  }, [items, q, isSelected])

  const field = 'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[var(--text)]'

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} className={`${field} flex items-center justify-between gap-2 text-left focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60`}>
        <span className={`truncate ${selectedLabel ? '' : 'text-[var(--text-faint)]'}`}>{selectedLabel || placeholder}</span>
        <ChevronDown size={16} className={`shrink-0 text-[var(--text-faint)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-[var(--surface)] shadow-lg overflow-hidden">
          <div className="relative p-2 border-b border-[var(--border)]">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700 text-sm text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none" />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.map(s => {
              const on = isSelected(s)
              return (
                <button type="button" key={s.id}
                  onClick={() => { onPick(s); if (closeOnPick && !multi) { setOpen(false); setQ('') } }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition ${on ? 'bg-emerald-500/10 text-[var(--text)]' : 'text-[var(--text)] hover:bg-[var(--hover)]'}`}>
                  {multi && <span className={`grid place-items-center w-4 h-4 rounded border ${on ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-500'}`}>{on && <Check size={12} className="text-white" />}</span>}
                  <span className="truncate flex-1">{s.name}</span>
                  {!multi && on && <Check size={14} className="text-emerald-500 shrink-0" />}
                </button>
              )
            })}
            {!filtered.length && <p className="px-3 py-3 text-sm text-[var(--text-faint)]">No matches.</p>}
          </div>
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
