'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, X, Save } from 'lucide-react'

const CATEGORIES = ['Electrical', 'Plumbing', 'HVAC', 'Refrigeration', 'Gas', 'Structural', 'General', 'Cleaning', 'Other']
const IMPACTS: { v: string; label: string }[] = [
  { v: 'none', label: 'No operational impact' },
  { v: 'cosmetic', label: 'Cosmetic / minor' },
  { v: 'customer_visible', label: 'Customer-visible' },
  { v: 'staff_inconvenience', label: 'Staff inconvenience' },
  { v: 'trading_affected', label: 'Trading affected' },
  { v: 'safety_risk', label: 'Safety risk' },
  { v: 'cannot_trade', label: 'Store cannot trade' },
]

interface Props { ticketId: string; initial: { title: string; category: string; impact: string; description: string } }

/** Field heading above an input/select/textarea. */
function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{label}</label>
      {children}
    </div>
  )
}

export function EditTicketForm({ ticketId, initial }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [title, setTitle] = useState(initial.title)
  const [category, setCategory] = useState(initial.category || 'General')
  const [impact, setImpact] = useState(initial.impact || 'none')
  const [description, setDescription] = useState(initial.description)

  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-[#C6A35D]/40'

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, category, operational_impact: impact }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to save')
      setEditing(false); router.refresh()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  async function del() {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to delete')
      router.push('/client/tickets'); router.refresh()
    } catch (e: any) { setError(e.message); setBusy(false) }
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        <div className="flex gap-3">
          <button onClick={() => setEditing(true)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition"><Pencil size={15} /> Edit ticket</button>
          <button onClick={() => setConfirmDelete(true)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl ring-1 ring-red-500/40 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-500/10 transition"><Trash2 size={15} /> Delete</button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {confirmDelete && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setConfirmDelete(false)}>
            <div className="bg-[var(--surface-2)] ring-1 ring-[var(--border)] rounded-2xl p-5 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
              <p className="font-semibold text-[var(--text)]">Delete this ticket?</p>
              <p className="text-sm text-[var(--text-muted)]">This can&apos;t be undone.</p>
              <div className="flex gap-2">
                <button disabled={busy} onClick={del} className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50">Yes, delete</button>
                <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-5">
      <div className="flex items-center justify-between"><span className="text-sm font-semibold text-[var(--text)]">Edit ticket</span><button type="button" onClick={() => setEditing(false)} className="text-[var(--text-faint)] hover:text-[var(--text)]"><X size={16} /></button></div>
      <Labeled label="Title"><input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" required /></Labeled>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="Category"><select className={input} value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></Labeled>
        <Labeled label="Operational Impact"><select className={input} value={impact} onChange={e => setImpact(e.target.value)}>{IMPACTS.map(i => <option key={i.v} value={i.v}>{i.label}</option>)}</select></Labeled>
      </div>
      <Labeled label="Description"><textarea className={`${input} min-h-[90px]`} value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" required /></Labeled>
      <p className="text-[11px] text-[var(--text-faint)]">Priority is recalculated from the operational impact.</p>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#C6A35D] text-[#0a0e17] text-sm font-semibold disabled:opacity-50"><Save size={14} /> {busy ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={() => setEditing(false)} className="px-3 py-2 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
      </div>
    </form>
  )
}
