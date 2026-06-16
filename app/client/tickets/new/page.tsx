'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusCircle, Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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

export default function LogTicketPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('General')
  const [impact, setImpact] = useState('none')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const input = 'w-full px-3 py-2.5 rounded-xl bg-[#121826] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#C6A35D]/50'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
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
      <div><h1 className="text-2xl font-bold text-white flex items-center gap-2"><PlusCircle className="text-[#C6A35D]" size={22} /> Log a Ticket</h1>
        <p className="text-sm text-slate-400 mt-0.5">Describe the maintenance issue at your store.</p></div>

      <form onSubmit={submit} className="space-y-4">
        <Field label="Title"><input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Aircon not cooling" required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><select className={input} value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c} value={c} className="bg-[#121826]">{c}</option>)}</select></Field>
          <Field label="Operational Impact"><select className={input} value={impact} onChange={e => setImpact(e.target.value)}>{IMPACTS.map(i => <option key={i.v} value={i.v} className="bg-[#121826]">{i.label}</option>)}</select></Field>
        </div>
        <Field label="Description"><textarea className={`${input} min-h-[110px]`} value={description} onChange={e => setDescription(e.target.value)} placeholder="What's wrong, where, since when…" required /></Field>

        <Field label="Photos (optional)">
          <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#121826] border border-dashed border-white/15 text-slate-400 cursor-pointer hover:border-[#C6A35D]/50">
            <Upload size={16} /> Add photos
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
          </label>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {files.map((f, i) => (
                <span key={i} className="flex items-center gap-1 text-[11px] bg-white/5 text-slate-300 rounded-lg px-2 py-1">
                  {f.name.slice(0, 18)}<button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </Field>

        {error && <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>}
        <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-[#C6A35D] text-[#0a0e17] font-semibold disabled:opacity-60">{loading ? 'Logging…' : 'Submit Ticket'}</button>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-slate-400 mb-1">{label}</label>{children}</div>
}
