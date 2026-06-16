'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { Card } from '@/components/exec/ui'

export interface SignoffRow { signoffId: string; ticketId: string; title: string; storeName: string; before: string[]; after: string[]; coc: string | null }

export function RegionalSignoffReview({ rows }: { rows: SignoffRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  async function act(ticketId: string, signoffId: string, action: string, reason?: string) {
    setBusy(signoffId); setErr('')
    try {
      const res = await fetch('/api/regional/ticket-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId, action, signoffId, reason }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      router.refresh()
    } catch (e: any) { setErr(e.message) } finally { setBusy(null) }
  }

  if (!rows.length) return <Card className="p-8 text-center"><p className="text-sm text-slate-500">No jobs awaiting sign-off.</p></Card>

  return (
    <div className="space-y-3">
      {err && <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{err}</div>}
      {rows.map(r => (
        <Card key={r.signoffId} className="p-4 space-y-3">
          <div><p className="text-sm font-medium text-white">{r.title}</p><p className="text-[11px] text-slate-500">{r.storeName}</p></div>
          <div className="flex flex-wrap gap-3 text-xs">
            {r.before.map((u, i) => <a key={`b${i}`} href={u} target="_blank" className="text-[#C6A35D] underline">Before {i + 1}</a>)}
            {r.after.map((u, i) => <a key={`a${i}`} href={u} target="_blank" className="text-[#C6A35D] underline">After {i + 1}</a>)}
            {r.coc && <a href={r.coc} target="_blank" className="text-[#C6A35D] underline">COC</a>}
            {!r.before.length && !r.after.length && !r.coc && <span className="text-slate-500">No evidence attached</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => act(r.ticketId, r.signoffId, 'signoff_accept')} disabled={busy === r.signoffId} className="flex items-center justify-center gap-2 flex-1 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"><Check size={15} /> Accept & complete</button>
            <button onClick={() => act(r.ticketId, r.signoffId, 'signoff_reject', prompt('What evidence is missing?') ?? undefined)} disabled={busy === r.signoffId} className="flex items-center justify-center gap-2 flex-1 px-3 py-2 rounded-xl bg-white/5 text-red-400 text-sm font-medium disabled:opacity-50"><X size={15} /> Reject</button>
          </div>
        </Card>
      ))}
    </div>
  )
}
