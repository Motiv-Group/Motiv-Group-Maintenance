'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Check, X } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { formatDateTime } from '@/lib/utils'
import { errMsg } from '@/components/ui/errMsg'

export type MotivAccessRequest = { companyId: string; companyName: string; requestedAt: string }

// System-admin review of companies requesting access to the Motiv supplier
// directory. Approve → their RMs can browse/assign Motiv suppliers.
export function MotivAccessRequests({ requests }: { requests: MotivAccessRequest[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  async function decide(companyId: string, decision: 'approve' | 'reject') {
    setBusy(companyId); setErr('')
    try {
      const res = await fetch('/api/admin/suppliers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: `motiv_access_${decision}`, companyId }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Failed') }
      router.refresh()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(null) }
  }

  if (!requests.length) return null
  return (
    <Card className="p-4 ring-amber-500/40">
      <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2 mb-1"><KeyRound size={15} className="text-amber-500" /> Motiv access requests ({requests.length})</h2>
      <p className="text-xs text-[var(--text-muted)] mb-3">These companies asked to use the Motiv supplier directory when requesting quotes. Approve to unlock it for their regional managers.</p>
      <ul className="space-y-2">
        {requests.map(r => (
          <li key={r.companyId} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--surface-2)] px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text)] truncate">{r.companyName}</p>
              <p className="text-[11px] text-[var(--text-faint)]">Requested {formatDateTime(r.requestedAt)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => decide(r.companyId, 'reject')} disabled={busy === r.companyId}
                className="inline-flex items-center gap-1 rounded-lg ring-1 ring-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--hover)] transition disabled:opacity-50"><X size={13} /> Decline</button>
              <button type="button" onClick={() => decide(r.companyId, 'approve')} disabled={busy === r.companyId}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-white transition disabled:opacity-50"><Check size={13} /> {busy === r.companyId ? '…' : 'Approve'}</button>
            </div>
          </li>
        ))}
      </ul>
      {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
    </Card>
  )
}
