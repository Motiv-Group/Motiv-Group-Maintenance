export const dynamic = 'force-dynamic'

import { Map as MapIcon } from 'lucide-react'
import { requireExecutive } from '@/lib/dashboards/guard'
import { assembleEstateDashboard, type RegionRankRow } from '@/lib/dashboards/data'
import { RagBadge } from '@/components/dashboards/primitives'
import { ResponsiveTable, type RTColumn } from '@/components/dashboards/ResponsiveTable'
import { formatCurrency } from '@/lib/utils'

export default async function ExecutiveRegionsPage() {
  await requireExecutive()
  const data = await assembleEstateDashboard()

  const columns: RTColumn<RegionRankRow>[] = [
    { header: 'Region', role: 'title', cell: r => (
      <span className="font-medium text-gray-900 dark:text-white"><span className="text-gray-400 mr-1">#{r.rank}</span>{r.regionName}</span>
    ) },
    { header: 'Health', role: 'badge', cell: r => <span className="font-semibold">{r.region.finalPortfolioHealth}%</span> },
    { header: 'Status', role: 'badge', cell: r => <RagBadge rag={r.region.rag} /> },
    { header: 'Stores', cell: r => r.region.activeStores },
    { header: 'Red/Crit', cell: r => `${r.region.counts.red}/${r.region.counts.critical}` },
    { header: 'Open', cell: r => r.region.openTickets },
    { header: 'Sup SLA', hideMobile: true, cell: r => r.region.supplierSlaBreaches },
    { header: 'Int SLA', hideMobile: true, cell: r => r.region.internalSlaBreaches },
    { header: 'Cost', cell: r => formatCurrency(r.region.costExposure) },
    { header: 'Executive note', hideMobile: true, cell: r => <span className="text-xs text-gray-500 dark:text-gray-400">{r.region.mainReason}</span> },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <MapIcon size={20} className="text-brand-600 dark:text-brand-300" /> Regional Ranking
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Highest-risk regions first. Portfolio health = average store health − risk penalty.</p>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-3 sm:p-4">
        <ResponsiveTable
          columns={columns}
          rows={data.regions}
          getKey={r => r.region.regionId}
          minWidth={860}
          empty="No active regions yet."
        />
      </div>
    </div>
  )
}
