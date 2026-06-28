export const dynamic = 'force-dynamic'

import { Truck } from 'lucide-react'
import { requireRegionalV3 } from '@/lib/health/guard'
import { assembleRegionalDashboard } from '@/lib/health/data'
import { ProvisionButton } from '@/components/exec/ProvisionPanel'
import { RegionalSuppliersTable } from '@/components/exec/RegionalSuppliersTable'

export default async function RegionalSuppliersPage() {
  const { companyId, regionIds } = await requireRegionalV3()
  const { suppliers } = await assembleRegionalDashboard(companyId, regionIds)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Truck className="text-[#C6A35D]" size={22} /> Suppliers</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Suppliers active on tickets in your region. Tap one for full details.</p>
        </div>
        <ProvisionButton mode="suppliers" tone="green" label="Add Supplier" />
      </div>
      <RegionalSuppliersTable suppliers={suppliers} />
    </div>
  )
}
