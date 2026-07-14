export const dynamic = 'force-dynamic'

import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { SupplierSignoff } from '@/components/supplier/SupplierSignoff'

export default async function SupplierSignoffPage() {
  const { companyId, supplierIds } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)
  return <SupplierSignoff signoffs={d.signoffs} />
}
