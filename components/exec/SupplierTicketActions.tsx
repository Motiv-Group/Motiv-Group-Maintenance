'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Send, Upload, ReceiptText, ClipboardCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  ticketId: string
  status: string
  acknowledged: boolean
  before: boolean; after: boolean; coc: boolean
  quoteSubmitted: boolean
}

export function SupplierTicketActions(p: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setErr('')
    try {
      const res = await fetch('/api/supplier/ticket-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId: p.ticketId, action, ...extra }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      router.refresh()
    } catch (e: any) { setErr(e.message) } finally { setBusy(null) }
  }

  async function uploadAndRecord(file: File, bucket: string, kind: string) {
    setBusy(kind); setErr('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const path = `${user?.id}/${p.ticketId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
      if (error) throw error
      const url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
      if (kind === 'quote') { await act('add_quote', { amount: Number(amount), file_url: url }); return }
      await act('add_evidence', { kind, url })
    } catch (e: any) { setErr(e.message); setBusy(null) }
  }

  const terminal = ['completed', 'cancelled', 'declined', 'submitted_for_signoff'].includes(p.status)
  const btn = 'flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50'

  return (
    <div className="space-y-4">
      {err && <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{err}</div>}

      {!p.acknowledged && !terminal && (
        <button onClick={() => act('acknowledge')} disabled={!!busy} className={`${btn} w-full bg-[#C6A35D] text-[#0a0e17]`}><Check size={16} /> Acknowledge ticket</button>
      )}

      {!terminal && (
        <div className="space-y-2">
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add a progress update…" className="w-full px-3 py-2.5 rounded-xl bg-[#121826] border border-white/10 text-white placeholder-slate-500 text-sm min-h-[70px]" />
          <button onClick={() => { if (note.trim()) act('add_update', { body: note }).then(() => setNote('')) }} disabled={!!busy || !note.trim()} className={`${btn} bg-white/5 text-white`}><Send size={15} /> Send update</button>
        </div>
      )}

      {!terminal && !p.quoteSubmitted && (
        <div className="flex items-center gap-2">
          <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="Quote amount (ZAR)" className="flex-1 px-3 py-2.5 rounded-xl bg-[#121826] border border-white/10 text-white placeholder-slate-500 text-sm" />
          <label className={`${btn} bg-white/5 text-white cursor-pointer`}><ReceiptText size={15} /> Quote PDF
            <input type="file" accept="application/pdf,image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f && Number(amount) > 0) uploadAndRecord(f, 'quote-attachments', 'quote') }} />
          </label>
        </div>
      )}

      {!terminal && (
        <div className="grid grid-cols-3 gap-2">
          <EvidenceBtn label="Before" done={p.before} busy={busy === 'before_photo'} onPick={f => uploadAndRecord(f, 'ticket-photos', 'before_photo')} />
          <EvidenceBtn label="After" done={p.after} busy={busy === 'after_photo'} onPick={f => uploadAndRecord(f, 'ticket-photos', 'after_photo')} />
          <EvidenceBtn label="COC" done={p.coc} busy={busy === 'coc'} onPick={f => uploadAndRecord(f, 'completion-docs', 'coc')} />
        </div>
      )}

      {!terminal && (
        <button onClick={() => { if (confirm('Submit this job for sign-off? The company will confirm completion.')) act('submit_signoff') }} disabled={!!busy} className={`${btn} w-full bg-emerald-600 text-white`}>
          <ClipboardCheck size={16} /> Submit for sign-off
        </button>
      )}
      {p.status === 'submitted_for_signoff' && <p className="text-sm text-[#C6A35D] text-center">Submitted — awaiting company sign-off.</p>}
    </div>
  )
}

function EvidenceBtn({ label, done, busy, onPick }: { label: string; done: boolean; busy: boolean; onPick: (f: File) => void }) {
  return (
    <label className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border cursor-pointer text-xs ${done ? 'border-emerald-500/40 text-emerald-400' : 'border-white/10 text-slate-300'}`}>
      <Upload size={15} />{busy ? '…' : done ? `${label} ✓` : label}
      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f) }} />
    </label>
  )
}
