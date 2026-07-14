export const dynamic = 'force-dynamic'

import { requireRegionalV3 } from '@/lib/health/guard'
import { assembleRegionalDashboard } from '@/lib/health/data'
import { RegionalSuppliersTable } from '@/components/exec/RegionalSuppliersTable'

export default async function RegionalSuppliersPage() {
  const { companyId, regionIds } = await requireRegionalV3()
  const { suppliers } = await assembleRegionalDashboard(companyId, regionIds)

  return <RegionalSuppliersTable suppliers={suppliers} />
}
