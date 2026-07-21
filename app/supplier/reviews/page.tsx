export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import { requireSupplierV3 } from '@/lib/health/guard'
import { SupplierReviews, type SupplierReview } from '@/components/supplier/SupplierReviews'

const ROLE_LABEL: Record<string, string> = {
  regional_manager: 'Client', store_manager: 'Store Manager', client: 'Store Manager',
  executive: 'Executive', system_admin: 'Admin', individual: 'Customer', supplier: 'Supplier',
}

export default async function SupplierReviewsPage() {
  const { supplierIds } = await requireSupplierV3()
  const db = createAdminClient()

  const { data: ratings } = supplierIds.length
    ? await db.from('ratings').select('id, score, comment, created_at, ticket_id, rated_by')
        .in('supplier_id', supplierIds).order('created_at', { ascending: false })
    : { data: null }
  const rows = ratings ?? []

  // Resolve tickets (title/category/store/completed) + reviewers (name/role) in
  // separate queries — the ratings→tickets/profiles relationships aren't embeddable.
  const ticketIds = [...new Set(rows.map(r => r.ticket_id).filter((v): v is string => !!v))]
  const raterIds = [...new Set(rows.map(r => r.rated_by).filter((v): v is string => !!v))]
  const [{ data: ticketRows }, { data: raterRows }] = await Promise.all([
    ticketIds.length ? db.from('tickets').select('id, title, category, store_id, completed_at, job_ref').in('id', ticketIds) : Promise.resolve({ data: null }),
    raterIds.length ? db.from('user_profiles').select('id, full_name, role').in('id', raterIds) : Promise.resolve({ data: null }),
  ])
  const ticketById = new Map((ticketRows ?? []).map(t => [t.id, t] as const))
  const storeIds = [...new Set((ticketRows ?? []).map(t => t.store_id).filter((v): v is string => !!v))]
  const { data: storeRows } = storeIds.length ? await db.from('stores').select('id, name, sub_store').in('id', storeIds) : { data: null }
  const storeById = new Map((storeRows ?? []).map(s => [s.id, s] as const))
  const raterById = new Map((raterRows ?? []).map(p => [p.id, p] as const))

  // Drop ratings whose ticket has since been deleted (keeps the list honest).
  const reviews: SupplierReview[] = rows
    .filter(r => !r.ticket_id || ticketById.has(r.ticket_id))
    .map(r => {
      const t = r.ticket_id ? ticketById.get(r.ticket_id) : null
      const store = t?.store_id ? storeById.get(t.store_id) : null
      const rater = r.rated_by ? raterById.get(r.rated_by) : null
      return {
        id: r.id, score: r.score, comment: r.comment ?? null, createdAt: r.created_at,
        ticketId: r.ticket_id ?? null, jobRef: t?.job_ref ?? null,
        category: t?.category ?? null, storeName: store?.name ?? null,
        completedAt: t?.completed_at ?? null,
        reviewerName: rater?.full_name ?? null, reviewerRole: rater ? (ROLE_LABEL[rater.role] ?? 'Reviewer') : 'Reviewer',
      }
    })

  return <SupplierReviews reviews={reviews} now={new Date().toISOString()} />
}
