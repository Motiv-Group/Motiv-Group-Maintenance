export const dynamic = 'force-dynamic'

import { ShieldAlert, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { requireExecutive } from '@/lib/dashboards/guard'
import { assembleEstateDashboard, type StoreCard } from '@/lib/dashboards/data'
import type { RankedStore } from '@/lib/dashboards/ranking'
import { RagBadge, SectionCard } from '@/components/dashboards/primitives'
import { ResponsiveTable, type RTColumn } from '@/components/dashboards/ResponsiveTable'
import { formatCurrency } from '@/lib/utils'

export default async function ExecutiveStoresPage() {
  await requireExecutive()
  const data = await assembleEstateDashboard()
  const regionName = new Map(data.regions.map(r => [r.region.regionId, r.regionName]))
  const rn = (id: string | null) => regionName.get(id ?? '') ?? '—'

  const riskColumns: RTColumn<RankedStore<StoreCard>>[] = [
    { header: 'Store', role: 'title', cell: ({ rank, store }) => (
      <span className="font-medium text-gray-900 dark:text-white"><span className="text-gray-400 mr-1">#{rank}</span>{store.storeName}</span>
    ) },
    { header: 'Health', role: 'badge', cell: ({ store }) => <span className="font-semibold">{store.finalHealthScore}%</span> },
    { header: 'Status', role: 'badge', cell: ({ store }) => <RagBadge rag={store.finalRag} /> },
    { header: 'Region', cell: ({ store }) => rn(store.regionId) },
    { header: 'Main risk', cell: ({ store }) => <span className="text-gray-500 dark:text-gray-400">{store.mainIssue}</span> },
    { header: 'Open', cell: ({ store }) => store.openTickets },
    { header: 'Overdue', cell: ({ store }) => store.overdueTickets },
    { header: 'Approvals', hideMobile: true, cell: ({ store }) => store.pendingApprovals },
    { header: 'Exposure', cell: ({ store }) => formatCurrency(store.costExposure) },
  ]

  const bandColumns: RTColumn<StoreCard>[] = [
    { header: 'Store', role: 'title', cell: s => <span className="font-medium text-gray-900 dark:text-white">{s.storeName}</span> },
    { header: 'Health', role: 'badge', cell: s => <span className="font-semibold">{s.finalHealthScore}%</span> },
    { header: 'Status', role: 'badge', cell: s => <RagBadge rag={s.finalRag} /> },
    { header: 'Region', cell: s => rn(s.regionId) },
    { header: 'Open', cell: s => s.openTickets },
    { header: 'Overdue', cell: s => s.overdueTickets },
    { header: 'Note', cell: s => <span className="text-gray-500 dark:text-gray-400">{s.mainIssue}</span> },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ShieldAlert size={20} className="text-red-500" /> Store Ranking
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Every store grouped by health band. Top risk first, then attention, then controlled.</p>
      </div>

      <SectionCard title={`Top Risk (${data.topRiskStores.length})`} icon={<ShieldAlert size={16} className="text-red-500" />}>
        <ResponsiveTable columns={riskColumns} rows={data.topRiskStores} getKey={r => r.store.storeId} minWidth={820} empty="No stores under stress." />
      </SectionCard>

      <SectionCard title={`Amber — Attention (${data.amberStores.length})`} icon={<AlertTriangle size={16} className="text-amber-500" />}>
        <ResponsiveTable columns={bandColumns} rows={data.amberStores} getKey={s => s.storeId} minWidth={640} empty="No stores in the amber band." />
      </SectionCard>

      <SectionCard title={`Controlled (${data.controlledStores.length})`} icon={<CheckCircle2 size={16} className="text-green-500" />}>
        <ResponsiveTable columns={bandColumns} rows={data.controlledStores} getKey={s => s.storeId} minWidth={640} empty="No stores in the green band yet." />
      </SectionCard>
    </div>
  )
}
