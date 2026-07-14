export const dynamic = 'force-dynamic'

import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { SupplierSnags } from '@/components/supplier/SupplierSnags'

const SNAG_STATUSES = new Set(['snag', 'snag_assigned', 'snag_resolved', 'snag_in_progress'])

export default async function SupplierSnagPage() {
  const { companyId, supplierIds } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)
  // Every snag the supplier owns — snag-phase tickets plus any awarded ticket with
  // an open dispute (which pauses the snag while it's reviewed).
  const snags = d.tickets.filter(t => t.awardedToMe && (SNAG_STATUSES.has(t.status) || (t.disputed && t.snagReason != null)))
  return <SupplierSnags snags={snags} company={d.company} generatedAt={d.generatedAt} />
}
