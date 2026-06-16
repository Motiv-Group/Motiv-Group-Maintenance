export const dynamic = 'force-dynamic'

import { Gavel, Repeat } from 'lucide-react'
import { requireExecutive } from '@/lib/dashboards/guard'
import { assembleEstateDashboard } from '@/lib/dashboards/data'
import { SectionCard } from '@/components/dashboards/primitives'
import { ResponsiveTable, type RTColumn } from '@/components/dashboards/ResponsiveTable'
import { DECISION_CHIP } from '@/components/dashboards/decisionChip'
import type { DecisionItem } from '@/lib/dashboards/decisions'

type RepeatRow = Awaited<ReturnType<typeof assembleEstateDashboard>>['repeatDefects'][number]

export default async function ExecutiveDecisionsPage() {
  await requireExecutive()
  const data = await assembleEstateDashboard()

  const decisionCols: RTColumn<DecisionItem>[] = [
    { header: 'Decision', role: 'title', cell: d => (
      <div className="min-w-0">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${DECISION_CHIP[d.category]}`}>{d.category}</span>
        <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{d.decisionRequired}</p>
      </div>
    ) },
    { header: 'Value', role: 'badge', cell: d => <span className="text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{d.value}</span> },
    { header: 'Reason', cell: d => <span className="text-gray-500 dark:text-gray-400">{d.reason}</span> },
    { header: 'Action', hideMobile: true, cell: d => <span className="text-gray-500 dark:text-gray-400">{d.recommendedAction}</span> },
    { header: 'Owner', cell: d => <span className="whitespace-nowrap">{d.owner}</span> },
    { header: 'Due', cell: d => `${d.deadlineDays}d` },
  ]

  const repeatCols: RTColumn<RepeatRow>[] = [
    { header: 'Defect', role: 'title', cell: d => (
      <span className="font-medium text-gray-900 dark:text-white capitalize">{d.category} <span className="text-gray-400 font-normal">· {d.storeName}</span></span>
    ) },
    { header: 'Repeats', role: 'badge', cell: d => <span className="font-semibold text-pink-600 dark:text-pink-400">×{d.count}</span> },
    { header: 'Region', cell: d => d.regionName },
    { header: 'Likely cause', hideMobile: true, cell: d => <span className="text-gray-500 dark:text-gray-400">{d.possibleRootCause}</span> },
    { header: 'Suggested action', cell: d => <span className="text-gray-500 dark:text-gray-400">{d.suggestedAction}</span> },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Gavel size={20} className="text-indigo-500" /> Executive Decisions Required
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Exception-based. Each item names the reason, impact, recommended action, owner and deadline.</p>
      </div>

      <SectionCard title="Decisions" icon={<Gavel size={16} className="text-indigo-500" />}>
        <ResponsiveTable columns={decisionCols} rows={data.decisions} getKey={(_, i) => String(i)} minWidth={820} empty="No decisions outstanding." />
      </SectionCard>

      <SectionCard title="Repeat Defect & Root-Cause Analysis" icon={<Repeat size={16} className="text-pink-500" />}>
        <ResponsiveTable columns={repeatCols} rows={data.repeatDefects} getKey={(_, i) => String(i)} minWidth={760} empty="No repeat-defect patterns in the last 30 days." />
      </SectionCard>
    </div>
  )
}
