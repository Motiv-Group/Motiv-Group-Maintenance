export const dynamic = 'force-dynamic'

import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { PerformanceDashboard, type RecentJob } from '@/components/supplier/PerformanceDashboard'

const COMPLETED = new Set(['completed', 'approved_closeout'])

export default async function SupplierPerformancePage() {
  const { companyId, supplierIds } = await requireSupplierV3()
  const { perf, tickets, rating } = await assembleSupplierDashboard(companyId, supplierIds)

  const recent: RecentJob[] = tickets
    .filter(t => t.awardedToMe && COMPLETED.has(t.status))
    .sort((a, b) => new Date(b.quoteApprovedAt ?? b.createdAt).getTime() - new Date(a.quoteApprovedAt ?? a.createdAt).getTime())
    .slice(0, 6)
    .map(t => ({ id: t.id, jobRef: t.jobRef, title: t.title, storeName: t.storeName, category: t.category, isIndividual: t.isIndividual, breached: t.breached, date: t.quoteApprovedAt ?? t.createdAt }))

  return <PerformanceDashboard perf={perf} recent={recent} rating={rating} />
}
