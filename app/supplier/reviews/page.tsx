export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import { requireSupplierV3 } from '@/lib/health/guard'
import { BackButton } from '@/components/ui/BackButton'
import { Card } from '@/components/exec/ui'
import { Star } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

function StarRow({ score }: { score: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={13}
          className={i <= score ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-300 dark:fill-slate-700 dark:text-slate-600'}
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
        .select('id, score, comment, created_at, ticket_id')
        .in('supplier_id', supplierIds)
        .order('created_at', { ascending: false })
    : { data: [] as any[] }

  // Resolve ticket titles in a separate query — the ratings→tickets relationship
  // isn't embeddable (no FK), so a `tickets(title)` embed errors and returns nothing.
  // Ratings whose ticket has since been deleted are dropped from the list.
  const ratingRows = (ratings ?? []) as any[]
  const ticketIds = [...new Set(ratingRows.map(r => r.ticket_id).filter(Boolean))]
  const { data: ticketRows } = ticketIds.length
    ? await adminDb.from('tickets').select('id, title').in('id', ticketIds)
    : { data: [] as any[] }
  const titleById = new Map(((ticketRows ?? []) as any[]).map(t => [t.id, t.title]))
  const reviews = ratingRows
    .filter(r => !r.ticket_id || titleById.has(r.ticket_id))
    .map(r => ({ ...r, ticketTitle: r.ticket_id ? titleById.get(r.ticket_id) : null }))
  // Suppliers start at a full 5★ and degrade as real reviews arrive.
  const avgRating = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.score, 0) / reviews.length
    : 5

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">My Reviews</h1>
          <p className="text-sm text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1.5">
            <Star size={14} className="fill-amber-400 text-amber-400" />
            {avgRating.toFixed(1)} / 5 {reviews.length > 0 ? `average across ${reviews.length} review${reviews.length !== 1 ? 's' : ''}` : '— starting rating, no reviews yet'}
          </p>
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center">
          <div>
            <Star size={28} className="mx-auto text-[var(--text-faint)] mb-2" />
            <p className="text-sm text-[var(--text-faint)]">No reviews yet — they appear here after a regional manager approves a job.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r: any) => (
            <Card key={r.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">
                    {r.ticketTitle ?? 'Unknown ticket'}
                  </p>
                  <p className="text-xs text-[var(--text-faint)] mt-0.5">{formatDateTime(r.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StarRow score={r.score} />
                  <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{r.score}/5</span>
                </div>
              </div>
              {r.comment ? (
                <p className="text-sm text-[var(--text-muted)] bg-[var(--hover)] ring-1 ring-[var(--border)] rounded-lg px-3 py-2 leading-relaxed">
                  {r.comment}
                </p>
              ) : (
                <p className="text-xs text-[var(--text-faint)] italic">No comment left.</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
