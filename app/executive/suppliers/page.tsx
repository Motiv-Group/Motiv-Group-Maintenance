export const dynamic = 'force-dynamic'

import { requireExecutiveV3 } from '@/lib/health/guard'
import { assembleEstateDashboard } from '@/lib/health/data'
import { SuppliersTab } from '@/components/exec/SuppliersTab'

export default async function ExecutiveSuppliersPage() {
  const { companyId } = await requireExecutiveV3()
  const data = await assembleEstateDashboard(companyId)
  return <SuppliersTab data={data} />
}
