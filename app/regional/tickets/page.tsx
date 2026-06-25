export const dynamic = 'force-dynamic'

import { requireRegionalV3 } from '@/lib/health/guard'
import { assembleRegionalDashboard } from '@/lib/health/data'
import { RegionalTickets } from '@/components/exec/RegionalTickets'

export default async function RegionalTicketsPage() {
  const { companyId, regionIds } = await requireRegionalV3()
  const data = await assembleRegionalDashboard(companyId, regionIds)
  return <RegionalTickets tickets={data.tickets} />
}
