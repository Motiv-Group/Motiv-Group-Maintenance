'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'

export function SupplierReviewActions({ supplierId, companyName }: { supplierId: string; companyName: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [confirm, setConfirm] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState('')

  async function act(action: 'approve' | 'reject') {
    setBusy(action); setError(''); setConfirm(null)
    const res = await fetch('/api/admin/suppliers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, supplierId }),
    })
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Failed'); setBusy(null); return }
    router.refresh()
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {confirm ? (
        <div className="w-64 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] p-3 space-y-2">
          <p className="text-xs text-[var(--text)]">
            {confirm === 'approve'
              ? `Approve ${companyName} into the Motiv supplier pool?`
              : `Reject ${companyName}? They will be notified and cannot receive work.`}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => act(confirm)} disabled={!!busy}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-60 ${confirm === 'approve' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-700'}`}>
              {busy ? 'Working…' : 'Yes'}
            </button>
            <button type="button" onClick={() => setConfirm(null)} disabled={!!busy}
              className="flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)] transition disabled:opacity-60">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => setConfirm('approve')} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-white transition disabled:opacity-60">
            <Check size={14} /> {busy === 'approve' ? 'Approving…' : 'Approve'}
          </button>
          <button type="button" onClick={() => setConfirm('reject')} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-lg ring-1 ring-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 px-3.5 py-2 text-xs font-semibold transition disabled:opacity-60">
            <X size={14} /> {busy === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      )}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
