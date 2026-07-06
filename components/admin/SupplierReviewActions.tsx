'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'

export function SupplierReviewActions({ supplierId, companyName }: { supplierId: string; companyName: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState('')

  async function act(action: 'approve' | 'reject') {
    if (action === 'reject' && !window.confirm(`Reject ${companyName}? They will be notified and cannot receive work.`)) return
    if (action === 'approve' && !window.confirm(`Approve ${companyName} into the Motiv supplier pool?`)) return
    setBusy(action); setError('')
    const res = await fetch('/api/admin/suppliers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, supplierId }),
    })
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Failed'); setBusy(null); return }
    router.refresh()
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <button type="button" onClick={() => act('approve')} disabled={!!busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-white transition disabled:opacity-60">
          <Check size={14} /> {busy === 'approve' ? 'Approving…' : 'Approve'}
        </button>
        <button type="button" onClick={() => act('reject')} disabled={!!busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 text-red-500 hover:bg-red-500/10 px-3.5 py-2 text-xs font-semibold transition disabled:opacity-60">
          <X size={14} /> {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
