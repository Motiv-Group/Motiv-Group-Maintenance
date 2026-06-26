'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Plus, Phone, Pencil, Trash2, X, Check } from 'lucide-react'
import { Card } from '@/components/exec/ui'

export interface Technician { id: string; name: string; phone: string }

const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] outline-none focus:ring-[#C6A35D]/40'

export function TechniciansManager({ technicians }: { technicians: Technician[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [editId, setEditId] = useState<string | null>(null)

  async function create() {
    if (!name.trim() || !phone.trim()) { setErr('Name and phone are both required.'); return }
    setBusy(true); setErr('')
    const res = await fetch('/api/supplier/technicians', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone }) })
    setBusy(false)
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'Could not add technician'); return }
    setName(''); setPhone(''); setAdding(false); router.refresh()
  }

  async function remove(id: string) {
    if (!confirm('Remove this technician? They will no longer be assignable to jobs.')) return
    const res = await fetch(`/api/supplier/technicians/${id}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Users className="text-teal-600 dark:text-teal-400" size={22} /> Technicians</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Your roster of technicians. Assign one when scheduling a job.</p>
        </div>
        {!adding && (
          <button onClick={() => { setAdding(true); setErr('') }} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition shrink-0"><Plus size={16} /> Add Technician</button>
        )}
      </div>

      {adding && (
        <Card className="p-4 space-y-3">
          <p className="text-sm font-semibold text-[var(--text)]">New technician</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={input} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
            <input className={input} type="tel" inputMode="tel" placeholder="Phone (e.g. +27 82 123 4567)" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={create} disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save technician'}</button>
            <button onClick={() => { setAdding(false); setErr('') }} className="px-4 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
          </div>
        </Card>
      )}

      <Card className="p-2">
        {technicians.length === 0 && !adding && <p className="text-sm text-[var(--text-faint)] text-center py-8">No technicians yet — add your first one.</p>}
        {technicians.map(t => (
          <TechRow key={t.id} tech={t} editing={editId === t.id} onEdit={() => setEditId(t.id)} onCancel={() => setEditId(null)} onSaved={() => { setEditId(null); router.refresh() }} onRemove={() => remove(t.id)} />
        ))}
      </Card>
    </div>
  )
}

function TechRow({ tech, editing, onEdit, onCancel, onSaved, onRemove }: {
  tech: Technician; editing: boolean; onEdit: () => void; onCancel: () => void; onSaved: () => void; onRemove: () => void
}) {
  const [name, setName] = useState(tech.name)
  const [phone, setPhone] = useState(tech.phone)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!name.trim() || !phone.trim()) { setErr('Name and phone required.'); return }
    setBusy(true); setErr('')
    const res = await fetch(`/api/supplier/technicians/${tech.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone }) })
    setBusy(false)
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'Could not save'); return }
    onSaved()
  }

  if (editing) {
    return (
      <div className="px-3 py-3 border-b border-[var(--border)] last:border-0 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input className={input} value={name} onChange={e => setName(e.target.value)} />
          <input className={input} type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"><Check size={13} /> {busy ? 'Saving…' : 'Save'}</button>
          <button onClick={onCancel} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-xs"><X size={13} /> Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-3 border-b border-[var(--border)] last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text)] truncate">{tech.name}</p>
        <a href={`tel:${tech.phone}`} className="text-[11px] text-[var(--text-muted)] hover:text-[#C6A35D] inline-flex items-center gap-1"><Phone size={11} /> {tech.phone}</a>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit} title="Edit" className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[#C6A35D] hover:bg-[#C6A35D]/10 transition"><Pencil size={15} /></button>
        <button onClick={onRemove} title="Remove" className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-red-500 hover:bg-red-500/10 transition"><Trash2 size={15} /></button>
      </div>
    </div>
  )
}
