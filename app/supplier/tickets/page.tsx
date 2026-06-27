export const dynamic = 'force-dynamic'

import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { SupplierTickets } from '@/components/supplier/SupplierTickets'

export default async function SupplierTicketsPage() {
  const { companyId, supplierIds } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)
  return <SupplierTickets tickets={d.tickets} quotes={d.quotes} company={d.company} />
}
