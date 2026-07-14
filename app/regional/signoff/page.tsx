export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import { requireRegionalV3 } from '@/lib/health/guard'
import { RegionalSignoff, type RegionalSignoffRow } from '@/components/regional/RegionalSignoff'
import { storeLabel } from '@/lib/utils'

const REVIEW_STATUSES = ['submitted_for_signoff', 'evidence_requested']

export default async function RegionalSignoffPage() {
  const { companyId, regionIds } = await requireRegionalV3()
  const admin = createAdminClient()

  let rows: RegionalSignoffRow[] = []
  if (regionIds.length) {
    const { data: tickets } = await admin.from('tickets')
      .select('id, title, category, priority, store_id, supplier_id, status, job_ref, created_at')
      .eq('company_id', companyId).in('region_id', regionIds).in('status', REVIEW_STATUSES)
    const tks = (tickets ?? []) as any[]
    if (tks.length) {
      const ticketIds = tks.map(t => t.id)
      const storeIds = Array.from(new Set(tks.map(t => t.store_id).filter(Boolean))) as string[]
      const supplierIds = Array.from(new Set(tks.map(t => t.supplier_id).filter(Boolean))) as string[]
      const [{ data: stores }, { data: suppliers }, { data: signoffRows }] = await Promise.all([
        storeIds.length ? admin.from('stores').select('id, name, sub_store, branch_code').in('id', storeIds) : Promise.resolve({ data: [] as any[] }),
        supplierIds.length ? admin.from('suppliers').select('id, company_name').in('id', supplierIds) : Promise.resolve({ data: [] as any[] }),
        admin.from('signoffs').select('ticket_id, before_urls, after_urls, coc_url, invoice_url, created_at').in('ticket_id', ticketIds).order('created_at', { ascending: true }),
      ])
      const storeName = new Map((stores ?? []).map((s: any) => [s.id, storeLabel(s.name, s.sub_store)]))
      const storeBranch = new Map((stores ?? []).map((s: any) => [s.id, s.branch_code ?? null]))
      const supplierName = new Map((suppliers ?? []).map((s: any) => [s.id, s.company_name]))
      // Latest submission per ticket → its photo / certificate counts + submitted time.
      const latest = new Map<string, any>()
      for (const s of ((signoffRows ?? []) as any[])) latest.set(s.ticket_id, s)   // asc order → last wins

      rows = tks.map(t => {
        const s = latest.get(t.id)
        return {
          id: t.id, storeName: storeName.get(t.store_id) ?? 'Store', branchCode: storeBranch.get(t.store_id) ?? null,
          category: t.category ?? null, title: t.title ?? 'Ticket', priority: t.priority, status: t.status,
          jobRef: t.job_ref ?? null, supplier: supplierName.get(t.supplier_id) ?? null,
          submittedAt: s?.created_at ?? t.created_at,
          photoCount: s ? ((s.before_urls ?? []).length + (s.after_urls ?? []).length) : 0,
          certCount: s ? ((s.coc_url ? 1 : 0) + (s.invoice_url ? 1 : 0)) : 0,
        }
      })
    }
  }

  return <RegionalSignoff signoffs={rows} />
}
