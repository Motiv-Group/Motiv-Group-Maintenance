'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { CheckCircle, ArrowDown } from 'lucide-react'
import type { TicketStatus } from '@/lib/types'

const STATUS_OPTIONS: Record<string, { value: TicketStatus; label: string; color: string }[]> = {
  accepted: [
    { value: 'in_progress', label: 'Mark In Progress', color: 'amber' },
  ],
  in_progress: [],
  snag: [
    { value: 'snag_in_progress', label: 'Start Snag Work', color: 'amber' },
    { value: 'cancelled',        label: 'Cancel Ticket',   color: 'gray'  },
  ],
  snag_in_progress: [
    { value: 'cancelled', label: 'Cancel Ticket', color: 'gray' },
  ],
}

const COLOR_CLASSES: Record<string, string> = {
  amber: 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700',
  gray:  'border-gray-300 text-gray-500 bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600',
}

const SUCCESS_HINT: Partial<Record<TicketStatus, string>> = {
  in_progress:      'Ticket is now In Progress. Scroll down to submit COC & POC when work is complete.',
  snag_in_progress: 'Snag acknowledged — work in progress. Scroll down to re-submit COC & POC when done.',
  cancelled:        'Ticket has been cancelled.',
}

export function UpdateStatusForm({ ticketId, currentStatus }: { ticketId: string; currentStatus: TicketStatus }) {
  const router  = useRouter()
  const options = STATUS_OPTIONS[currentStatus] ?? []
  const [selected,  setSelected]  = useState<TicketStatus | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [succeeded, setSucceeded] = useState<TicketStatus | null>(null)

  async function save() {
    if (!selected || selected === currentStatus) return
    setLoading(true)
    setError('')
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: selected }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error || 'Failed to update status')
      setLoading(false)
      return
    }
    setSucceeded(selected)
    setLoading(false)
    // Use router.refresh() to properly invalidate Next.js router cache and re-fetch server data
    router.refresh()
  }

  if (options.length === 0) return null

  // Success state — shown briefly before router.refresh() fires
  if (succeeded) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 flex items-start gap-3">
        <CheckCircle size={18} className="text-green-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-green-800 dark:text-green-300">Status updated successfully</p>
          {SUCCESS_HINT[succeeded] && (
            <p className="text-xs text-green-700 dark:text-green-400 mt-0.5 flex items-center gap-1">
              {succeeded === 'in_progress' && <ArrowDown size={11} className="shrink-0" />}
              {SUCCESS_HINT[succeeded]}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Update Status</p>
      {currentStatus === 'snag' && (
        <p className="text-xs text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">
          This ticket was rejected during sign-off. Click <strong>Start Snag Work</strong> to acknowledge and begin fixing the issue, then re-submit COC &amp; POC.
        </p>
      )}
      {currentStatus === 'snag_in_progress' && (
        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
          Snag work is in progress. Scroll down to re-submit COC &amp; POC once the issue is resolved.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSelected(prev => prev === opt.value ? null : opt.value)}
            className={[
              'py-1.5 px-3 rounded-lg text-xs font-medium border transition-all',
              COLOR_CLASSES[opt.color],
              selected === opt.value ? 'ring-2 ring-offset-1 ring-brand-500' : 'opacity-80 hover:opacity-100',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {selected && selected !== currentStatus && (
        <Button onClick={save} loading={loading} size="sm" className="w-full">
          Confirm — {options.find(o => o.value === selected)?.label}
        </Button>
      )}
    </div>
  )
}
