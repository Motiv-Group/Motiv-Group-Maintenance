export const dynamic = 'force-dynamic'

import { requireRegionalV3 } from '@/lib/health/guard'
import { assembleRegionalDashboard } from '@/lib/health/data'
import { RegionalStores } from '@/components/exec/RegionalStores'

export default async function RegionalStoresPage() {
  const { companyId, regionIds } = await requireRegionalV3()
  const data = await assembleRegionalDashboard(companyId, regionIds)
  return <RegionalStores stores={data.stores} />
}
