export const dynamic = 'force-dynamic'

import { requireExecutiveV3 } from '@/lib/health/guard'
import { assembleEstateDashboard } from '@/lib/health/data'
import { DecisionsTab } from '@/components/exec/DecisionsTab'

export default async function ExecutiveDecisionsPage() {
  const { companyId } = await requireExecutiveV3()
  const data = await assembleEstateDashboard(companyId)
  return <DecisionsTab data={data} />
}
