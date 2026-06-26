export const dynamic = 'force-dynamic'

import { requireExecutiveV3 } from '@/lib/health/guard'
import { assembleEstateDashboard } from '@/lib/health/data'
import { StoresTab } from '@/components/exec/StoresTab'

const STATUSES = ['controlled', 'attention', 'at_risk', 'critical']

export default async function ExecutiveStoresPage({ searchParams }: { searchParams?: { status?: string } }) {
  const { companyId } = await requireExecutiveV3()
  const data = await assembleEstateDashboard(companyId)
  const initialStatus = STATUSES.includes(searchParams?.status ?? '') ? searchParams!.status! : 'all'
  return <StoresTab data={data} initialStatus={initialStatus} />
}
