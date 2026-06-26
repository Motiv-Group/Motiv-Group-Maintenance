export const dynamic = 'force-dynamic'

import { Repeat } from 'lucide-react'
import { requireExecutiveV3 } from '@/lib/health/guard'
import { assembleEstateDashboard } from '@/lib/health/data'
import { StoreMetricBreakdown } from '@/components/exec/StoreMetricBreakdown'

export default async function RepeatDefectsInsightPage() {
  const { companyId } = await requireExecutiveV3()
  const data = await assembleEstateDashboard(companyId)
  const rows = data.stores.map(s => ({ storeId: s.storeId, storeName: s.storeName, regionName: s.regionName, status: s.finalStatus, raw: s.repeatGroups, value: `${s.repeatGroups} group${s.repeatGroups === 1 ? '' : 's'}` }))
  const total = data.stores.reduce((a, s) => a + s.repeatGroups, 0)
  return (
    <StoreMetricBreakdown
      title="Repeat Defects"
      subtitle="Recurring defect groups by store across the estate."
      icon={<Repeat className="text-rose-600 dark:text-rose-400" size={22} />}
      rows={rows}
      valueLabel="Repeat groups"
      total={`${total} group${total === 1 ? '' : 's'}`}
    />
  )
}
