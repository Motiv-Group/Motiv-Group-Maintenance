export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import { requireRegionalV3 } from '@/lib/health/guard'
import { RegionalSnags, type RegionalSnagRow } from '@/components/regional/RegionalSnags'
import { storeLabel } from '@/lib/utils'

const SNAG_STATUSES = ['snag', 'snag_assigned', 'snag_in_progress', 'snag_resolved']

export default async function RegionalSnagPage() {
  const { companyId, regionIds } = await requireRegionalV3()
  const admin = createAdminClient()

  let rows: RegionalSnagRow[] = []
  if (regionIds.length) {
    const { data: tickets } = await admin.from('tickets')
      .select('id, title, category, priority, store_id, supplier_id, status, job_ref, description, created_at')
      .eq('company_id', companyId).in('region_id', regionIds).in('status', SNAG_STATUSES)
    const tks = (tickets ?? []) as any[]
    if (tks.length) {
      const ticketIds = tks.map(t => t.id)
      const storeIds = Array.from(new Set(tks.map(t => t.store_id).filter(Boolean))) as string[]
      const supplierIds = Array.from(new Set(tks.map(t => t.supplier_id).filter(Boolean))) as string[]
      const [{ data: stores }, { data: suppliers }, { data: disputeRows }, { data: signoffRows }] = await Promise.all([
        storeIds.length ? admin.from('stores').select('id, name, sub_store, branch_code').in('id', storeIds) : Promise.resolve({ data: [] as any[] }),
        supplierIds.length ? admin.from('suppliers').select('id, company_name').in('id', supplierIds) : Promise.resolve({ data: [] as any[] }),
        admin.from('ticket_disputes').select('ticket_id').eq('status', 'open').in('ticket_id', ticketIds),
        admin.from('signoffs').select('ticket_id, status, reject_reason, created_at').in('ticket_id', ticketIds).eq('status', 'rejected').order('created_at', { ascending: true }),
      ])
      const storeName = new Map((stores ?? []).map((s: any) => [s.id, storeLabel(s.name, s.sub_store)]))
      const storeBranch = new Map((stores ?? []).map((s: any) => [s.id, s.branch_code ?? null]))
      const supplierName = new Map((suppliers ?? []).map((s: any) => [s.id, s.company_name]))
      const disputedIds = new Set(((disputeRows ?? []) as any[]).map(d => d.ticket_id))
      const reasonBy = new Map<string, string>()
      for (const s of ((signoffRows ?? []) as any[])) if (s.reject_reason) reasonBy.set(s.ticket_id, s.reject_reason)   // latest wins (asc order)

      rows = tks.map(t => ({
        id: t.id, storeName: storeName.get(t.store_id) ?? 'Store', branchCode: storeBranch.get(t.store_id) ?? null,
        category: t.category ?? null, title: t.title ?? 'Ticket', priority: t.priority, status: t.status,
        jobRef: t.job_ref ?? null, description: t.description ?? null, createdAt: t.created_at, dueAt: null,
        disputed: disputedIds.has(t.id), snagReason: reasonBy.get(t.id) ?? null,
        supplier: supplierName.get(t.supplier_id) ?? null,
      }))
    }
  }

  return <RegionalSnags snags={rows} generatedAt={new Date().toISOString()} />
}
