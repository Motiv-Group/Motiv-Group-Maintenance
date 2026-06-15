'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate, formatDateTime, QUOTE_STATUS_LABELS } from '@/lib/utils'
import { FileText } from 'lucide-react'
import type { Quote } from '@/lib/types'

interface QuoteCardProps {
  quote: Quote
  ticketId: string
}

export function QuoteCard({ quote, ticketId }: QuoteCardProps) {
  const router = useRouter()
  const [loading,    setLoading]    = useState<'accept' | 'decline' | null>(null)
  const [error,      setError]      = useState('')
  const [confirming, setConfirming] = useState(false)

  const statusColors: Record<string, string> = {
    pending:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400',
    accepted: 'bg-green-100  text-green-800  dark:bg-green-950  dark:text-green-400',
    declined: 'bg-gray-100   text-gray-700   dark:bg-gray-800   dark:text-gray-400',
  }

  async function respond(status: 'accepted' | 'declined') {
    setLoading(status === 'accepted' ? 'accept' : 'decline')
    setError('')
    const res = await fetch(`/api/quotes/${quote.id}/respond`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Something went wrong.')
    }
    setLoading(null)
    setConfirming(false)
    router.refresh()
  }

  return (
    <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(quote.amount)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(quote.created_at)}</p>
        </div>
        <Badge className={statusColors[quote.status] ?? ''}>
          {QUOTE_STATUS_LABELS[quote.status]}
        </Badge>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-300">{quote.description}</p>

      {quote.valid_until && (
        <p className="text-xs text-gray-400">Valid until: {formatDate(quote.valid_until)}</p>
      )}

      {(quote as any).file_url && (
        <a
          href={(quote as any).file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400 hover:underline"
        >
          <FileText size={15} /> View attachment
        </a>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {quote.status === 'pending' && !confirming && (
        <div className="flex gap-2 pt-1">
          <Button onClick={() => respond('accepted')} loading={loading === 'accept'} className="flex-1" size="sm">
            Accept Quote
          </Button>
          <Button onClick={() => setConfirming(true)} variant="danger" className="flex-1" size="sm">
            Decline
          </Button>
        </div>
      )}

      {quote.status === 'pending' && confirming && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 space-y-2">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">Are you sure you want to decline?</p>
          <div className="flex gap-2">
            <Button onClick={() => respond('declined')} loading={loading === 'decline'} variant="danger" size="sm" className="flex-1">
              Yes, decline
            </Button>
            <Button onClick={() => setConfirming(false)} variant="secondary" size="sm" className="flex-1" disabled={loading !== null}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
