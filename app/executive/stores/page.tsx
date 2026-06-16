export const dynamic = 'force-dynamic'

import { requireExecutiveV3 } from '@/lib/health/guard'
import { assembleEstateDashboard } from '@/lib/health/data'
import { StoresTab } from '@/components/exec/StoresTab'

export default async function ExecutiveStoresPage() {
  const { companyId } = await requireExecutiveV3()
  const data = await assembleEstateDashboard(companyId)
  return <StoresTab data={data} />
}
