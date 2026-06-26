export const dynamic = 'force-dynamic'

import { Lock } from 'lucide-react'
import { requireExecutiveV3 } from '@/lib/health/guard'
import { assembleEstateDashboard } from '@/lib/health/data'
import { StoreMetricBreakdown } from '@/components/exec/StoreMetricBreakdown'

export default async function InternalBreachesInsightPage() {
  const { companyId } = await requireExecutiveV3()
  const data = await assembleEstateDashboard(companyId)
  const rows = data.stores.map(s => ({ storeId: s.storeId, storeName: s.storeName, regionName: s.regionName, status: s.finalStatus, raw: s.internalBreaches, value: String(s.internalBreaches) }))
  const total = data.stores.reduce((a, s) => a + s.internalBreaches, 0)
  return (
    <StoreMetricBreakdown
      title="Internal SLA Breaches"
      subtitle="Internal SLA breaches by store across the estate."
      icon={<Lock className="text-amber-600 dark:text-amber-500" size={22} />}
      rows={rows}
      valueLabel="Breaches"
      total={`${total} breaches`}
    />
  )
}
