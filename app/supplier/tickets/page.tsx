export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { SupplierTickets } from '@/components/supplier/SupplierTickets'

export default async function SupplierTicketsPage() {
  const { companyId, supplierIds } = await requireSupplierV3()
  // Standalone (self-signup) suppliers have no client company yet — the dashboard
  // shows their pending/verified state. Motiv-pool ticket lists are a follow-up.
  if (!companyId) redirect('/supplier')
  const d = await assembleSupplierDashboard(companyId, supplierIds)
  return <SupplierTickets tickets={d.tickets} quotes={d.quotes} company={d.company} />
}
