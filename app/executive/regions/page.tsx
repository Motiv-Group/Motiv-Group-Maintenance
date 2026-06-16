export const dynamic = 'force-dynamic'

import { requireExecutiveV3 } from '@/lib/health/guard'
import { assembleEstateDashboard } from '@/lib/health/data'
import { RegionsTab } from '@/components/exec/RegionsTab'

export default async function ExecutiveRegionsPage() {
  const { companyId } = await requireExecutiveV3()
  const data = await assembleEstateDashboard(companyId)
  return <RegionsTab data={data} />
}
