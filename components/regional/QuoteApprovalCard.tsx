'use client'

import Link from 'next/link'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { FileText, CheckCircle, XCircle, RotateCcw, AlertTriangle, Star } from 'lucide-react'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import type { Quote } from '@/lib/types'

interface ContractorInfo {
  full_name: string | null
  email: string | null
  phone: string | null
  address?: string | null
}
interface RatingInfo {
  avg: number
  count: number
  reviews: { score: number; comment: string | null }[]
}

interface Props {
  quote: Quote
  ticketTitle: string
  ticketId: string
  contractor?: ContractorInfo
  rating?: RatingInfo
}

const DECLINE_REASONS = [
  'Quote too high',
  'Already attended to',
  'Future attendance',
  'Other (specify)',
] as const

export function QuoteApprovalCard({ quote, ticketTitle, ticketId, contractor, rating }: Props) {
  const router = useRouter()
  const [loading,          setLoading]          = useState<'accept' | 'decline' | 'revert' | null>(null)
  const [confirmingAccept, setConfirmingAccept]  = useState(false)
  const [confirming,       setConfirming]        = useState(false)
  const [selectedReason, setSelectedReason] = useState<string>('')
  const [otherReason,    setOtherReason]    = useState('')
  const [reasonError,    setReasonError]    = useState('')

  async function respond(status: 'accepted' | 'declined' | 'pending') {
    if (status === 'declined') {
      const reason = selectedReason === 'Other (specify)' ? otherReason.trim() : selectedReason
      if (!reason) { setReasonError('Please select a reason.'); return }
      if (selectedReason === 'Other (specify)' && !otherReason.trim()) {
        setReasonError('Please specify your reason.'); return
      }
      setLoading('decline')
      await fetch(`/api/quotes/${quote.id}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'declined', decline_reason: reason }),
      })
    } else {
      setLoading(status === 'accepted' ? 'accept' : 'revert')
      await fetch(`/api/quotes/${quote.id}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
    }
    setLoading(null)
    setConfirming(false)
    setConfirmingAccept(false)
    setSelectedReason('')
    setOtherReason('')
    setReasonError('')
    router.refresh()
  }

  const statusColors: Record<string, string> = {
    pending:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400',
    accepted: 'bg-green-100  text-green-800  dark:bg-green-950  dark:text-green-400',
    declined: 'bg-red-100    text-red-800    dark:bg-red-950    dark:text-red-400',
  }

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      quote.status === 'pending'
        ? 'bg-slate-50 dark:bg-gray-800 border-yellow-200 dark:border-yellow-800/40'
        : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{ticketTitle}</p>
          {quote.type === 'variation' && (
            <span className="inline-block my-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">
              Variation Order
            </span>
          )}
          <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(quote.amount)}</p>
          {quote.amount_incl_vat != null && (
            <p className="text-xs text-gray-400">Incl. VAT: {formatCurrency(quote.amount_incl_vat)}</p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(quote.created_at)}</p>
        </div>
        <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[quote.status] ?? ''}`}>
          {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
        </span>
      </div>

      {quote.description && (
        <p className="text-sm text-gray-600 dark:text-gray-300">{quote.description}</p>
      )}
      {quote.valid_until && (
        <p className="text-xs text-gray-400">Valid until: {formatDate(quote.valid_until)}</p>
      )}
      {(quote as any).decline_reason && (
        <p className="text-xs text-red-600 dark:text-red-400">
          Decline reason: {(quote as any).decline_reason}
        </p>
      )}
      {quote.file_url && (
        <a href={quote.file_url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-brand-600 dark:text-brand-400 hover:underline">
          <FileText size={13} /> View attachment
        </a>
      )}

      {/* Contractor — link to full profile page */}
      {contractor && (
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href={`/regional/suppliers/${(quote as any).admin_id}`}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
          >
            {contractor.full_name ?? 'Supplier'}
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </Link>
          {rating && (
            <Link
              href={`/regional/reviews/${(quote as any).admin_id}`}
              className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline"
            >
              <Star size={11} className="fill-amber-400 text-amber-400" />
              {rating.avg.toFixed(1)} / 5 ({rating.count})
            </Link>
          )}
        </div>
      )}

      {/* Pending — approve / decline */}
      {quote.status === 'pending' && !confirming && !confirmingAccept && (
        <div className="flex gap-2 pt-1">
          <Button onClick={() => setConfirmingAccept(true)} size="sm" className="flex-1">
            <CheckCircle size={14} className="mr-1.5" /> Approve
          </Button>
          <Button onClick={() => setConfirming(true)} variant="danger" size="sm" className="flex-1">
            <XCircle size={14} className="mr-1.5" /> Decline
          </Button>
        </div>
      )}

      {/* Approve confirmation */}
      {quote.status === 'pending' && confirmingAccept && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 space-y-3">
          <p className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-2">
            <CheckCircle size={15} /> Confirm approval of {formatCurrency(quote.amount)}?
          </p>
          <div className="flex gap-2">
            <Button onClick={() => respond('accepted')} loading={loading === 'accept'} size="sm" className="flex-1">
              Yes, Approve
            </Button>
            <Button onClick={() => setConfirmingAccept(false)} variant="secondary" size="sm" className="flex-1" disabled={loading !== null}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Decline — reason + confirmation */}
      {quote.status === 'pending' && confirming && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
            <AlertTriangle size={15} /> Please select a reason for declining
          </div>

          <div className="space-y-1.5">
            {DECLINE_REASONS.map(r => (
              <label key={r} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="decline_reason"
                  value={r}
                  checked={selectedReason === r}
                  onChange={() => { setSelectedReason(r); setReasonError('') }}
                  className="accent-red-600"
                />
                <span className="text-sm text-red-700 dark:text-red-300">{r}</span>
              </label>
            ))}
          </div>

          {selectedReason === 'Other (specify)' && (
            <input
              value={otherReason}
              onChange={e => { setOtherReason(e.target.value); setReasonError('') }}
              placeholder="Specify your reason…"
              className="w-full px-3 py-1.5 border border-red-300 dark:border-red-700 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          )}

          {reasonError && (
            <p className="text-xs text-red-600 dark:text-red-400">{reasonError}</p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => respond('declined')}
              loading={loading === 'decline'}
              variant="danger"
              size="sm"
              className="flex-1"
            >
              Confirm Decline
            </Button>
            <Button
              onClick={() => { setConfirming(false); setSelectedReason(''); setOtherReason(''); setReasonError('') }}
              variant="secondary"
              size="sm"
              className="flex-1"
              disabled={loading !== null}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Declined — show revert option */}
      {quote.status === 'declined' && (
        <Button
          onClick={() => respond('accepted')}
          loading={loading === 'revert'}
          variant="secondary"
          size="sm"
          className="w-full"
        >
          <RotateCcw size={13} className="mr-1.5" /> Revert to Accepted
        </Button>
      )}
    </div>
  )
}
