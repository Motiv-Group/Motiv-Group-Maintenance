'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { UserCheck, Check, X, Clock } from 'lucide-react'
import { SectionCard } from '@/components/exec/ui'

interface Pending { id: string; email: string; fullName: string | null; code: string; regionId: string; regionName: string }

/** Lists RMs who self-signed-up with a region code matching one of this
 *  executive's regions, with approve/reject. */
export function PendingRegionalManagers() {
  const router = useRouter()
  const [rows, setRows] = useState<Pending[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/provision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list_pending_rms' }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setRows(d.pending ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function act(userId: string, action: 'approve_rm' | 'reject_rm') {
    setBusy(userId); setErr('')
    try {
      const res = await fetch('/api/provision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, userId }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Failed')
      setRows(rs => rs.filter(r => r.id !== userId))
      router.refresh()
    } catch (e: any) { setErr(e.message) } finally { setBusy(null) }
  }

  if (loading || rows.length === 0) return null // hide entirely when nothing is pending

  return (
    <SectionCard title={`Pending Regional Managers (${rows.length})`} icon={<UserCheck size={15} className="text-[#C6A35D]" />}>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)] last:border-0">
            <div className="min-w-0">
              <p className="text-sm text-[var(--text)] truncate">{r.fullName || r.email}</p>
              <p className="text-[11px] text-[var(--text-faint)] truncate flex items-center gap-1">
                <Clock size={11} /> {r.email} · code <span className="text-[#C6A35D]">{r.code}</span> → {r.regionName}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button disabled={busy === r.id} onClick={() => act(r.id, 'approve_rm')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 disabled:opacity-50">
                <Check size={13} /> Approve
              </button>
              <button disabled={busy === r.id} onClick={() => act(r.id, 'reject_rm')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-xs hover:bg-[var(--hover)] disabled:opacity-50">
                <X size={13} /> Reject
              </button>
            </div>
          </div>
        ))}
      </div>
      {err && <p className="text-xs text-red-500 mt-2">{err}</p>}
    </SectionCard>
  )
}
