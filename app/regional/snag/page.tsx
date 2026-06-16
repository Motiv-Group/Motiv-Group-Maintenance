export const dynamic = 'force-dynamic'

import { AlertTriangle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireRegionalV3 } from '@/lib/health/guard'
import { RegionalSnagList, type SnagRow } from '@/components/exec/RegionalSnagList'

export default async function RegionalSnagPage() {
  const { companyId, regionIds } = await requireRegionalV3()
  const admin = createAdminClient()

  let rows: SnagRow[] = []
  if (regionIds.length) {
    const { data: stores } = await admin.from('stores').select('id, name, sub_store').eq('company_id', companyId).in('region_id', regionIds)
    const storeIds = (stores ?? []).map(s => s.id)
    const storeName = new Map((stores ?? []).map((s: any) => [s.id, [s.name, s.sub_store].filter(Boolean).join(' — ')]))
    if (storeIds.length) {
      const { data: snags } = await admin.from('snags').select('id, ticket_id, store_id, description, severity, created_at').eq('company_id', companyId).in('store_id', storeIds).in('status', ['open', 'in_progress']).order('created_at', { ascending: false })
      const ticketIds = Array.from(new Set((snags ?? []).map(s => s.ticket_id).filter(Boolean)))
      const { data: tickets } = ticketIds.length ? await admin.from('tickets').select('id, title').in('id', ticketIds) : { data: [] as any[] }
      const titleOf = new Map((tickets ?? []).map((t: any) => [t.id, t.title]))
      rows = (snags ?? []).map((s: any) => ({ id: s.id, ticketId: s.ticket_id, ticketTitle: titleOf.get(s.ticket_id) ?? '—', storeName: storeName.get(s.store_id) ?? 'Store', description: s.description ?? 'Snag', severity: s.severity ?? 'medium', createdAt: s.created_at }))
    }
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div><h1 className="text-2xl font-bold text-white flex items-center gap-2"><AlertTriangle className="text-[#C6A35D]" size={22} /> Snags</h1>
        <p className="text-sm text-slate-400 mt-0.5">Open snags in your region. Resolve once corrected.</p></div>
      <RegionalSnagList rows={rows} />
    </div>
  )
}
