'use client'

// RM logs a ticket on behalf of a store (same intake as the SM) + a store
// selector and an optional supplier invite. Creates the ticket via
// /api/regional/tickets; the normal lifecycle continues from there.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, UploadCloud, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const CATEGORIES = ['Electrical', 'Plumbing', 'HVAC', 'Refrigeration', 'Gas', 'Structural', 'General', 'Cleaning', 'Other']
const IMPACTS = [
  { v: 'none', label: 'No operational impact' }, { v: 'cosmetic', label: 'Cosmetic / minor' },
  { v: 'customer_visible', label: 'Customer-visible' }, { v: 'staff_inconvenience', label: 'Staff inconvenience' },
  { v: 'trading_affected', label: 'Trading affected' }, { v: 'safety_risk', label: 'Safety risk' }, { v: 'cannot_trade', label: 'Store cannot trade' },
]

export function RmNewTicketForm({ stores, suppliers }: { stores: { id: string; name: string }[]; suppliers: { id: string; name: string }[] }) {
  const router = useRouter()
  const [storeId, setStoreId] = useState('')
  const [storeQ, setStoreQ] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('General')
  const [impact, setImpact] = useState('none')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [supQ, setSupQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-[#C6A35D]/40'
  const storeName = stores.find(s => s.id === storeId)?.name ?? ''
  const filteredStores = useMemo(() => {
    const q = storeQ.trim().toLowerCase()
    return stores.filter(s => !q || s.name.toLowerCase().includes(q))
  }, [stores, storeQ])
  const filteredSuppliers = useMemo(() => {
    const q = supQ.trim().toLowerCase()
    return [...suppliers].filter(s => !q || s.name.toLowerCase().includes(q)).sort((a, b) => (sel.has(b.id) ? 1 : 0) - (sel.has(a.id) ? 1 : 0) || a.name.localeCompare(b.name))
  }, [suppliers, supQ, sel])
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!storeId) { setErr('Select a store.'); return }
    if (!title.trim() || !description.trim()) { setErr('Title and description are required.'); return }
    setBusy(true); setErr('')
    try {
      let photo_urls: string[] = []
      if (photos.length) {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        photo_urls = await Promise.all(photos.map(async f => {
          const path = `${user?.id}/new/${Date.now()}-${f.name.replace(/[^\w.\-]/g, '_')}`
          const { error } = await supabase.storage.from('ticket-photos').upload(path, f, { upsert: true })
          if (error) throw error
          return supabase.storage.from('ticket-photos').getPublicUrl(path).data.publicUrl
        }))
      }
      const res = await fetch('/api/regional/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, title, description, category, operational_impact: impact, photo_urls, supplierIds: [...sel] }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to create ticket')
      router.push('/regional/tickets'); router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Store selector (type to filter, click to select) */}
      <div>
        <label className="block text-sm font-medium text-[var(--text)] mb-1">Store <span className="text-red-500">*</span></label>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input className={`${input} pl-9`} placeholder={storeName || 'Type or select a store…'} value={storeQ} onChange={e => setStoreQ(e.target.value)} />
        </div>
        <div className="mt-1.5 max-h-44 overflow-y-auto rounded-xl ring-1 ring-[var(--border)] divide-y divide-[var(--border)]">
          {filteredStores.map(s => (
            <button type="button" key={s.id} onClick={() => { setStoreId(s.id); setStoreQ('') }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition ${storeId === s.id ? 'bg-[#C6A35D]/10 text-[var(--text)]' : 'text-[var(--text)] hover:bg-[var(--hover)]'}`}>
              <span className="truncate">{s.name}</span>
              {storeId === s.id && <Check size={14} className="text-[#C6A35D] shrink-0" />}
            </button>
          ))}
          {!filteredStores.length && <p className="px-3 py-2 text-sm text-[var(--text-faint)]">No matching store.</p>}
        </div>
      </div>

      <input className={input} placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} required />
      <div className="grid grid-cols-2 gap-2">
        <select className={input} value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <select className={input} value={impact} onChange={e => setImpact(e.target.value)}>{IMPACTS.map(i => <option key={i.v} value={i.v}>{i.label}</option>)}</select>
      </div>
      <textarea className={`${input} min-h-[100px]`} placeholder="Describe the issue…" value={description} onChange={e => setDescription(e.target.value)} required />

      {/* Photos (optional) */}
      <div>
        <label className="block text-sm font-medium text-[var(--text)] mb-1">Photos <span className="text-[var(--text-faint)] font-normal">(optional)</span></label>
        <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-[var(--border)] text-sm text-[var(--text-muted)] cursor-pointer hover:border-[#C6A35D]/50 transition">
          <UploadCloud size={16} /> {photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''} selected` : 'Add photos'}
          <input type="file" multiple accept="image/*" className="hidden" onChange={e => setPhotos(Array.from(e.target.files ?? []))} />
        </label>
      </div>

      {/* Optional supplier invite */}
      <div>
        <label className="block text-sm font-medium text-[var(--text)] mb-1">Invite suppliers to quote <span className="text-[var(--text-faint)] font-normal">(optional)</span></label>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input className={`${input} pl-9`} placeholder="Search suppliers…" value={supQ} onChange={e => setSupQ(e.target.value)} />
        </div>
        <div className="mt-1.5 max-h-40 overflow-y-auto space-y-1">
          {filteredSuppliers.map(s => (
            <label key={s.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer ${sel.has(s.id) ? 'bg-[#C6A35D]/10' : 'hover:bg-[var(--hover)]'}`}>
              <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} className="accent-[#C6A35D] w-4 h-4" />
              <span className="truncate text-[var(--text)]">{s.name}</span>
            </label>
          ))}
          {!filteredSuppliers.length && <p className="px-2 py-1.5 text-sm text-[var(--text-faint)]">No suppliers.</p>}
        </div>
      </div>

      {err && <p className="text-sm text-red-500">{err}</p>}
      <button type="submit" disabled={busy} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Logging…' : 'Log ticket'}</button>
    </form>
  )
}
