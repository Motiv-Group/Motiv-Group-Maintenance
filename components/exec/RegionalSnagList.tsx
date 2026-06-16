'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { Card } from '@/components/exec/ui'

export interface SnagRow { id: string; ticketId: string; ticketTitle: string; storeName: string; description: string; severity: string; createdAt: string }

export function RegionalSnagList({ rows }: { rows: SnagRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  async function resolve(r: SnagRow) {
    setBusy(r.id); setErr('')
    try {
      const res = await fetch('/api/regional/ticket-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resolve_snag', ticketId: r.ticketId, snagId: r.id }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      router.refresh()
    } catch (e: any) { setErr(e.message) } finally { setBusy(null) }
  }

  if (!rows.length) return <Card className="p-8 text-center"><p className="text-sm text-slate-500">No open snags.</p></Card>
  return (
    <div className="space-y-3">
      {err && <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{err}</div>}
      {rows.map(r => (
        <Card key={r.id} className="p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-white truncate">{r.description}</p>
            <p className="text-[11px] text-slate-500">{r.storeName} · {r.ticketTitle} · <span className="capitalize">{r.severity}</span></p>
          </div>
          <button onClick={() => resolve(r)} disabled={busy === r.id} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-50 shrink-0"><Check size={15} /> Resolve</button>
        </Card>
      ))}
    </div>
  )
}
