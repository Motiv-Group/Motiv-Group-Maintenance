export const dynamic = 'force-dynamic'

import { requireRegionalV3 } from '@/lib/health/guard'
import { assembleRegionalDashboard } from '@/lib/health/data'
import { RegionalOverview } from '@/components/exec/RegionalOverview'

export default async function RegionalOverviewPage() {
  const { companyId, regionIds, fullName } = await requireRegionalV3()
  const data = await assembleRegionalDashboard(companyId, regionIds)
  return <RegionalOverview data={data} name={fullName} />
}
