'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { CheckCircle, XCircle, FileText, Image as ImageIcon, AlertTriangle, Star } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import type { Completion } from '@/lib/types'

interface Props { completion: Completion }

const REJECT_REASONS = [
  'COC incomplete or incorrect',
  'Insufficient proof of completion photos',
  'Work quality not acceptable',
  'Wrong location / wrong ticket',
  'Other (specify)',
] as const

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="transition-transform hover:scale-110"
        >
          <Star
            size={28}
            className={`transition-colors ${
              star <= (hovered || value)
                ? 'fill-amber-400 text-amber-400'
                : 'fill-gray-200 text-gray-300 dark:fill-gray-700 dark:text-gray-600'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

const STAR_LABELS = ['', 'Poor', 'Below average', 'Good', 'Very good', 'Excellent']

export function CompletionReviewCard({ completion }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [ratingStep, setRatingStep] = useState(false)
  const [rating, setRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingError, setRatingError] = useState('')
  const [selectedReason, setSelectedReason] = useState('')
  const [otherReason, setOtherReason] = useState('')
  const [reasonError, setReasonError] = useState('')

  async function review(status: 'approved' | 'rejected') {
    const reason = status === 'rejected'
      ? (selectedReason === 'Other (specify)' ? otherReason.trim() : selectedReason)
      : undefined

    if (status === 'rejected' && !reason) { setReasonError('Please select a reason.'); return }
    if (status === 'rejected' && selectedReason === 'Other (specify)' && !otherReason.trim()) {
      setReasonError('Please specify your reason.'); return
    }
    if (status === 'approved' && rating === 0) { setRatingError('Please rate the work before approving.'); return }

    setLoading(status === 'approved' ? 'approve' : 'reject')
    await fetch(`/api/completions/${completion.id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        reject_reason: reason,
        ...(status === 'approved' ? { score: rating, comment: ratingComment.trim() || null } : {}),
      }),
    })
    setLoading(null)
    setConfirming(false)
    setRatingStep(false)
    setSelectedReason('')
    setOtherReason('')
    setReasonError('')
    setRating(0)
    setRatingComment('')
    router.refresh()
  }

  const isPending = completion.status === 'pending'

  return (
    <div className={`rounded-xl border p-5 space-y-4 ${
      isPending
        ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800/40'
        : completion.status === 'approved'
          ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/40'
          : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800/40'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">COC / Proof of Completion</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Submitted {formatDateTime(completion.created_at)}</p>
          {(completion as any).notes && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{(completion as any).notes}</p>
          )}
        </div>
        <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
          isPending
            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
            : completion.status === 'approved'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
        }`}>
          {isPending ? 'Pending Sign-off' : completion.status === 'approved' ? 'Approved' : 'Rejected'}
        </span>
      </div>

      {/* COC */}
      {completion.coc_url && (
        <a href={completion.coc_url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400 hover:underline font-medium">
          <FileText size={15} /> View Certificate of Completion (COC)
        </a>
      )}

      {/* POC Photos */}
      {completion.poc_urls.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <ImageIcon size={12} /> Proof of Completion ({completion.poc_urls.length} photo{completion.poc_urls.length !== 1 ? 's' : ''})
          </p>
          <div className="flex flex-wrap gap-3">
            {completion.poc_urls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                className="text-sm text-brand-600 dark:text-brand-400 hover:underline font-medium">
                View Photo {i + 1}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Rejection reason (if already rejected) */}
      {completion.status === 'rejected' && completion.reject_reason && (
        <div className="rounded-lg bg-rose-100 dark:bg-rose-900/30 px-3 py-2">
          <p className="text-xs font-medium text-rose-700 dark:text-rose-400">Rejection reason: {completion.reject_reason}</p>
        </div>
      )}

      {/* Actions — pending only, initial state */}
      {isPending && !confirming && !ratingStep && (
        <div className="flex gap-2 pt-1">
          <Button onClick={() => setRatingStep(true)} className="flex-1 bg-green-600 hover:bg-green-700 text-white" size="sm">
            <CheckCircle size={14} className="mr-1.5" /> Approve
          </Button>
          <Button onClick={() => setConfirming(true)} variant="danger" size="sm" className="flex-1">
            <XCircle size={14} className="mr-1.5" /> Reject
          </Button>
        </div>
      )}

      {/* Approve: star rating step */}
      {isPending && ratingStep && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Star size={16} className="text-amber-400" />
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Rate the quality of work</p>
          </div>
          <div className="space-y-2">
            <StarRating value={rating} onChange={(v) => { setRating(v); setRatingError('') }} />
            {rating > 0 && (
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{STAR_LABELS[rating]}</p>
            )}
            {ratingError && <p className="text-xs text-red-600 dark:text-red-400">{ratingError}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Comment <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={ratingComment}
              onChange={e => setRatingComment(e.target.value)}
              rows={2}
              placeholder="Any notes on the quality of work…"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>
          <p className="text-xs text-green-700 dark:text-green-400 font-medium flex items-center gap-2">
            <CheckCircle size={13} /> Approving marks this ticket as <strong>Completed</strong>.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => review('approved')}
              loading={loading === 'approve'}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              size="sm"
            >
              Confirm Approval
            </Button>
            <Button
              onClick={() => { setRatingStep(false); setRating(0); setRatingComment(''); setRatingError('') }}
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

      {/* Reject flow */}
      {isPending && confirming && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-rose-700 dark:text-rose-400">
            <AlertTriangle size={15} /> Select a reason for rejection
          </div>
          <div className="space-y-1.5">
            {REJECT_REASONS.map(r => (
              <label key={r} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="reject_reason" value={r} checked={selectedReason === r}
                  onChange={() => { setSelectedReason(r); setReasonError('') }} className="accent-rose-600" />
                <span className="text-sm text-rose-700 dark:text-rose-300">{r}</span>
              </label>
            ))}
          </div>
          {selectedReason === 'Other (specify)' && (
            <input value={otherReason} onChange={e => { setOtherReason(e.target.value); setReasonError('') }}
              placeholder="Specify reason…"
              className="w-full px-3 py-1.5 border border-rose-300 dark:border-rose-700 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500" />
          )}
          {reasonError && <p className="text-xs text-rose-600 dark:text-rose-400">{reasonError}</p>}
          <div className="flex gap-2">
            <Button onClick={() => review('rejected')} loading={loading === 'reject'} variant="danger" size="sm" className="flex-1">
              Confirm Reject
            </Button>
            <Button
              onClick={() => { setConfirming(false); setSelectedReason(''); setOtherReason(''); setReasonError('') }}
              variant="secondary" size="sm" className="flex-1" disabled={loading !== null}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
