export const dynamic = 'force-dynamic'

import { requireSupplierV3 } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { TechniciansManager, type Technician } from '@/components/supplier/TechniciansManager'

export default async function SupplierTechniciansPage() {
  const { supplierIds } = await requireSupplierV3()
  const admin = createAdminClient()
  const { data } = supplierIds.length
    ? await admin.from('technicians').select('id, name, phone').in('supplier_id', supplierIds).eq('active', true).order('name')
    : { data: [] as Technician[] }
  return <TechniciansManager technicians={(data ?? []) as Technician[]} />
}
