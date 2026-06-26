export const dynamic = 'force-dynamic'

import { ClipboardList } from 'lucide-react'
import { requireExecutiveV3 } from '@/lib/health/guard'
import { assembleEstateDashboard } from '@/lib/health/data'
import { StoreMetricBreakdown } from '@/components/exec/StoreMetricBreakdown'

export default async function OpenWorkInsightPage() {
  const { companyId } = await requireExecutiveV3()
  const data = await assembleEstateDashboard(companyId)
  const rows = data.stores.map(s => ({ storeId: s.storeId, storeName: s.storeName, regionName: s.regionName, status: s.finalStatus, raw: s.openTickets, value: String(s.openTickets) }))
  const total = data.stores.reduce((a, s) => a + s.openTickets, 0)
  return (
    <StoreMetricBreakdown
      title="Open Work"
      subtitle="Open tickets by store across the estate."
      icon={<ClipboardList className="text-blue-600 dark:text-blue-400" size={22} />}
      rows={rows}
      valueLabel="Open"
      total={`${total} open`}
    />
  )
}
