'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Truck, Check, X, AlertTriangle, Send } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Quote { id: string; amount: number; status: string }
interface Props {
  ticketId: string
  status: string
  supplierId: string | null
  suppliers: { id: string; name: string }[]
  quotes: Quote[]
  pendingSignoffId: string | null
}

export function RegionalTicketActions(p: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [supplier, setSupplier] = useState(p.supplierId ?? '')
  const [snag, setSnag] = useState('')

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/regional/ticket-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId: p.ticketId, action, ...extra }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      router.refresh()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const input = 'px-3 py-2.5 rounded-xl bg-[#121826] border border-white/10 text-white text-sm'
  const btn = 'flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50'
  const pendingQuotes = p.quotes.filter(q => q.status === 'pending')

  return (
    <div className="space-y-4">
      {err && <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{err}</div>}

      <div>
        <div className="text-xs text-slate-400 mb-1">Assign supplier</div>
        <div className="flex gap-2">
          <select value={supplier} onChange={e => setSupplier(e.target.value)} className={`${input} flex-1`}>
            <option value="" className="bg-[#121826]">— select —</option>
            {p.suppliers.map(s => <option key={s.id} value={s.id} className="bg-[#121826]">{s.name}</option>)}
          </select>
          <button onClick={() => supplier && act('assign_supplier', { supplierId: supplier })} disabled={busy || !supplier} className={`${btn} bg-[#C6A35D] text-[#0a0e17]`}><Truck size={15} /> Assign</button>
        </div>
      </div>

      {pendingQuotes.length > 0 && (
        <div>
          <div className="text-xs text-slate-400 mb-1">Quotes awaiting decision</div>
          {pendingQuotes.map(q => (
            <div key={q.id} className="flex items-center justify-between gap-2 py-2 border-b border-white/5 last:border-0">
              <span className="text-sm text-white">{formatCurrency(q.amount)}</span>
              <span className="flex gap-2">
                <button onClick={() => act('approve_quote', { quoteId: q.id })} disabled={busy} className={`${btn} bg-emerald-600 text-white py-1.5`}><Check size={14} /> Approve</button>
                <button onClick={() => { const r = prompt('Reason for declining?') ?? undefined; act('decline_quote', { quoteId: q.id, reason: r }) }} disabled={busy} className={`${btn} bg-white/5 text-red-400 py-1.5`}><X size={14} /> Decline</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {p.pendingSignoffId && (
        <div>
          <div className="text-xs text-slate-400 mb-1">Completion sign-off</div>
          <div className="flex gap-2">
            <button onClick={() => act('signoff_accept', { signoffId: p.pendingSignoffId })} disabled={busy} className={`${btn} flex-1 bg-emerald-600 text-white`}><Check size={15} /> Accept & complete</button>
            <button onClick={() => { const r = prompt('Why rejected? (what evidence is missing)') ?? undefined; act('signoff_reject', { signoffId: p.pendingSignoffId, reason: r }) }} disabled={busy} className={`${btn} flex-1 bg-white/5 text-red-400`}><X size={15} /> Reject</button>
          </div>
        </div>
      )}

      <div>
        <div className="text-xs text-slate-400 mb-1">Raise a snag</div>
        <div className="flex gap-2">
          <input value={snag} onChange={e => setSnag(e.target.value)} placeholder="Describe the snag…" className={`${input} flex-1`} />
          <button onClick={() => { if (snag.trim()) act('raise_snag', { description: snag }).then(() => setSnag('')) }} disabled={busy || !snag.trim()} className={`${btn} bg-white/5 text-[#C6A35D]`}><AlertTriangle size={15} /> Raise</button>
        </div>
      </div>

      <button onClick={() => act('request_update')} disabled={busy} className={`${btn} w-full bg-white/5 text-white`}><Send size={15} /> Request supplier update</button>
    </div>
  )
}
