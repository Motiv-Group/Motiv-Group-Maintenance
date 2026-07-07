export const dynamic = 'force-dynamic'

import { AlertTriangle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireRegionalV3 } from '@/lib/health/guard'
import { RegionalSnagList, type SnagRow } from '@/components/exec/RegionalSnagList'
import { storeLabel } from '@/lib/utils'

export default async function RegionalSnagPage() {
  const { companyId, regionIds } = await requireRegionalV3()
  const admin = createAdminClient()

  let rows: SnagRow[] = []
  if (regionIds.length) {
    const { data: stores } = await admin.from('stores').select('id, name, sub_store').eq('company_id', companyId).in('region_id', regionIds)
    const storeIds = (stores ?? []).map(s => s.id)
    // storeLabel dedupes name === sub_store (the old join rendered "Joburg Mall — Joburg Mall").
    const storeName = new Map((stores ?? []).map((s: any) => [s.id, storeLabel(s.name, s.sub_store)]))
    if (storeIds.length) {
      const { data: snags } = await admin.from('snags').select('id, ticket_id, store_id, description, severity, status, created_at').eq('company_id', companyId).in('store_id', storeIds).in('status', ['open', 'assigned', 'in_progress']).order('created_at', { ascending: false })
      const ticketIds = Array.from(new Set((snags ?? []).map(s => s.ticket_id).filter(Boolean)))
      const { data: tickets } = ticketIds.length ? await admin.from('tickets').select('id, title, priority').in('id', ticketIds as string[]) : { data: [] as any[] }
      const ticketBy = new Map((tickets ?? []).map((t: any) => [t.id, t]))
      rows = (snags ?? []).map((s: any) => ({ id: s.id, ticketId: s.ticket_id, ticketTitle: ticketBy.get(s.ticket_id)?.title ?? '—', priority: ticketBy.get(s.ticket_id)?.priority ?? 'P3', storeName: storeName.get(s.store_id) ?? 'Store', description: s.description ?? 'Snag', severity: s.severity ?? 'medium', status: s.status ?? 'open', createdAt: s.created_at }))
    }
  }

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><AlertTriangle className="text-red-600 dark:text-red-400" size={22} /> Snags</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Open snags in your region, grouped by store. Tap one to open its ticket.</p></div>
      <RegionalSnagList rows={rows} />
    </div>
  )
}
