'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, X, RotateCcw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Props {
  storeId: string
  storeName: string
  mode: 'close' | 'reopen'
}

export function StoreCloseControls({ storeId, storeName, mode }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(action: 'close' | 'reopen') {
    if (action === 'close' && !reason.trim()) { setError('Please enter a reason.'); return }
    setLoading(true)
    setError('')
    const res = await fetch('/api/regional/close-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, action, reason: reason.trim() }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error ?? 'Something went wrong.'); return }
    setOpen(false)
    setReason('')
    router.refresh()
  }

  // Stop the surrounding card link from navigating when the control is used.
  function stop(e: React.MouseEvent) { e.preventDefault(); e.stopPropagation() }

  if (mode === 'reopen') {
    return (
      <button
        type="button"
        onClick={(e) => { stop(e); submit('reopen') }}
        disabled={loading}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-brand-400 text-xs font-medium px-2.5 py-1 transition-colors disabled:opacity-50"
      >
        <RotateCcw size={12} /> {loading ? 'Reopening…' : 'Reopen'}
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => { stop(e); setOpen(true) }}
        title="Close store"
        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-red-400 hover:text-red-600 dark:hover:text-red-400 text-xs font-medium px-2.5 py-1 transition-colors"
      >
        <Archive size={12} /> Close
      </button>

      {open && (
        <div
          onClick={stop}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-500 shrink-0" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Close store</h3>
              </div>
              <button type="button" onClick={(e) => { stop(e); setOpen(false); setError('') }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300">
              Closing <span className="font-medium text-gray-900 dark:text-white">{storeName}</span> archives it
              and stops new tickets. No data is deleted — you can reopen it any time.
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Reason for closure</label>
              <textarea
                value={reason}
                onChange={e => { setReason(e.target.value); setError('') }}
                rows={3}
                placeholder="e.g. Branch permanently closed, account consolidated…"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
            </div>

            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex gap-2">
              <Button onClick={() => submit('close')} loading={loading} variant="danger" size="sm" className="flex-1">
                Close store
              </Button>
              <Button onClick={(e) => { stop(e as any); setOpen(false); setError('') }} variant="secondary" size="sm" className="flex-1" disabled={loading}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
