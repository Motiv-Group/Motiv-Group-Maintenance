'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Props {
  ticketId: string
  daysOpen: number
}

/**
 * Banner shown on the RM ticket detail when a ticket has sat Open for 7+ days.
 * The RM either declines it (with a reason → supplier & store notified) or takes
 * action — which is simply handling the ticket; the flag clears automatically
 * once the ticket progresses.
 */
export function StaleTicketActions({ ticketId, daysOpen }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  async function decline() {
    if (!reason.trim()) { setError('Please enter a reason.'); return }
    setLoading(true)
    setError('')
    const res = await fetch('/api/regional/decline-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId, reason: reason.trim() }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error ?? 'Something went wrong.'); return }
    router.refresh()
  }

  return (
    <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">
            Open for {daysOpen} days — needs a decision
          </p>
          <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
            This ticket has had no quote for over a week. Decline it, or take action below to keep it moving.
          </p>
        </div>
      </div>

      {!confirming ? (
        <div className="flex gap-2">
          <Button onClick={() => setConfirming(true)} variant="danger" size="sm" className="flex-1">
            Decline ticket
          </Button>
          <Button onClick={() => setDismissed(true)} variant="secondary" size="sm" className="flex-1">
            Take action
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-gray-800 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Reason for declining</p>
            <button type="button" onClick={() => { setConfirming(false); setError('') }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X size={16} />
            </button>
          </div>
          <textarea
            value={reason}
            onChange={e => { setReason(e.target.value); setError('') }}
            rows={2}
            placeholder="e.g. No longer required, duplicate, out of scope…"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
          />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <Button onClick={decline} loading={loading} variant="danger" size="sm" className="w-full">
            Confirm decline &amp; notify
          </Button>
        </div>
      )}
    </div>
  )
}
