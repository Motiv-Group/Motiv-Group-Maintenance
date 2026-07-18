'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { useScrollLock } from '@/lib/useScrollLock'
import { errMsg } from '@/components/ui/errMsg'

/**
 * Full-width delete button for the store manager's Next action card. Same shape
 * as the "Edit ticket" button (destructive red), gated behind a confirm dialog.
 * Only shown while a ticket is still editable (new / no info requested).
 */
export function DeleteTicketButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useScrollLock(confirm)

  async function del() {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to delete')
      router.push('/client/tickets'); router.refresh()
    } catch (e) { setError(errMsg(e)); setBusy(false) }
  }

  return (
    <>
      <button onClick={() => setConfirm(true)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-500">
        <Trash2 size={16} /> Delete ticket
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirm(false)}>
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-[var(--surface-2)] p-5 ring-1 ring-[var(--border)]" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-[var(--text)]">Delete this ticket?</p>
            <p className="text-sm text-[var(--text-muted)]">This can&apos;t be undone.</p>
            <div className="flex gap-2">
              <button disabled={busy} onClick={del} className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Deleting…' : 'Yes, delete'}</button>
              <button onClick={() => setConfirm(false)} className="flex-1 rounded-xl py-2 text-sm text-[var(--text-muted)] ring-1 ring-[var(--border)]">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
