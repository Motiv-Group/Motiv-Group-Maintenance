export const dynamic = 'force-dynamic'

import { requireStoreManagerV3 } from '@/lib/health/guard'
import { assembleStoreManagerDashboard } from '@/lib/health/data'
import { StoreTicketsList } from '@/components/client/StoreTicketsList'

export default async function StoreTicketsPage() {
  const { companyId, storeIds } = await requireStoreManagerV3()
  const d = await assembleStoreManagerDashboard(companyId, storeIds)
  return <StoreTicketsList tickets={d.tickets} />
}
