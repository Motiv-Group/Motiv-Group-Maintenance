export const dynamic = 'force-dynamic'

import { Banknote } from 'lucide-react'
import { requireExecutiveV3 } from '@/lib/health/guard'
import { assembleEstateDashboard } from '@/lib/health/data'
import { StoreMetricBreakdown } from '@/components/exec/StoreMetricBreakdown'
import { formatCurrency } from '@/lib/utils'

export default async function CostExposureInsightPage() {
  const { companyId } = await requireExecutiveV3()
  const data = await assembleEstateDashboard(companyId)
  const rows = data.stores.map(s => ({ storeId: s.storeId, storeName: s.storeName, regionName: s.regionName, status: s.finalStatus, raw: s.costExposure, value: formatCurrency(s.costExposure) }))
  const total = data.stores.reduce((a, s) => a + s.costExposure, 0)
  return (
    <StoreMetricBreakdown
      title="Cost & Exposure"
      subtitle="Commercial exposure by store across the estate."
      icon={<Banknote className="text-[#C6A35D]" size={22} />}
      rows={rows}
      valueLabel="Exposure"
      total={formatCurrency(total)}
    />
  )
}
