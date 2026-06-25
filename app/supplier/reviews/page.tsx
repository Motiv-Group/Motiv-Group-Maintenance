export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import { requireSupplierV3 } from '@/lib/health/guard'
import { BackButton } from '@/components/ui/BackButton'
import { Star } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

function StarRow({ score }: { score: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={13}
          className={i <= score ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-300 dark:fill-gray-700 dark:text-gray-600'}
        />
      ))}
    </span>
  )
}

export default async function SupplierReviewsPage() {
  const { supplierIds } = await requireSupplierV3()
  const adminDb = createAdminClient()

  const { data: ratings } = supplierIds.length
    ? await adminDb
        .from('ratings')
        .select('id, score, comment, created_at, ticket_id, tickets(title)')
        .in('supplier_id', supplierIds)
        .order('created_at', { ascending: false })
    : { data: [] as any[] }

  const reviews = (ratings ?? []) as any[]
  const avgRating = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.score, 0) / reviews.length
    : null

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">My Reviews</h1>
          {avgRating !== null && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1.5">
              <Star size={14} className="fill-amber-400 text-amber-400" />
              {avgRating.toFixed(1)} / 5 average across {reviews.length} review{reviews.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center">
          <Star size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No reviews yet — they appear here after a regional manager approves a job.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r: any) => (
            <div key={r.id} className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {r.tickets?.title ?? 'Unknown ticket'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(r.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StarRow score={r.score} />
                  <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{r.score}/5</span>
                </div>
              </div>
              {r.comment ? (
                <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2 leading-relaxed">
                  {r.comment}
                </p>
              ) : (
                <p className="text-xs text-gray-400 italic">No comment left.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
