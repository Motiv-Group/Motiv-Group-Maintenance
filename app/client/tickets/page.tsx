export const dynamic = 'force-dynamic'

import { requireStoreManagerV3 } from '@/lib/health/guard'
import { assembleStoreManagerDashboard } from '@/lib/health/data'
import { StoreTicketsList } from '@/components/client/StoreTicketsList'

const FILTERS = ['open', 'info_requested', 'scheduled', 'in_progress', 'completed', 'cancelled', 'overdue'] as const

export default async function StoreTicketsPage(props: { searchParams?: Promise<{ status?: string }> }) {
  const searchParams = await props.searchParams;
  const { companyId, storeIds } = await requireStoreManagerV3()
  const d = await assembleStoreManagerDashboard(companyId, storeIds)
  const status = searchParams?.status
  const initialFilter = FILTERS.find(f => f === status) ?? 'all'
  return <StoreTicketsList tickets={d.tickets} initialFilter={initialFilter} storeName={d.branch || d.storeName} />
}
