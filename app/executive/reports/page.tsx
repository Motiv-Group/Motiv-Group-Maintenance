export const dynamic = 'force-dynamic'

import { FileBarChart } from 'lucide-react'
import { requireExecutive } from '@/lib/dashboards/guard'
import { assembleEstateDashboard } from '@/lib/dashboards/data'
import { DistributionBar } from '@/components/dashboards/primitives'
import { PrintButton } from '@/components/dashboards/PrintButton'
import { PORTFOLIO_LABELS } from '@/lib/dashboards/constants'
import { formatCurrency, formatDateTime } from '@/lib/utils'

export default async function ExecutiveReportPage() {
  await requireExecutive()
  const data = await assembleEstateDashboard()
  const e = data.estate

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileBarChart size={20} className="text-brand-600" /> Executive Report
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Exception-based estate summary. Print or save as PDF.</p>
        </div>
        <PrintButton />
      </div>

      <article className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 space-y-6 print:border-0">
        <header className="border-b border-gray-100 dark:border-gray-700 pb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Estate Maintenance Report</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Generated {formatDateTime(data.generatedAt)}</p>
        </header>

        <section>
          <h3 className="font-bold text-gray-900 dark:text-white mb-1">Estate Health: {e.finalEstateHealth}% — {PORTFOLIO_LABELS[e.rag]}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Weighted regional health {e.weightedRegionalHealth}% − penalty {e.riskPenalty}. Main driver: {e.mainRiskDriver}.
            {' '}{e.totalActiveStores} active stores across {data.regions.length} regions.
          </p>
          <div className="mt-3 max-w-md"><DistributionBar counts={e.counts} /></div>
        </section>

        <ReportTable title="Regional Ranking" head={['#', 'Region', 'Health', 'Status', 'Stores', 'Red/Crit', 'Open', 'Cost']}
          rows={data.regions.map(r => [String(r.rank), r.regionName, `${r.region.finalPortfolioHealth}%`, PORTFOLIO_LABELS[r.region.rag], String(r.region.activeStores), `${r.region.counts.red}/${r.region.counts.critical}`, String(r.region.openTickets), formatCurrency(r.region.costExposure)])} />

        <ReportTable title="Top Risk Stores" head={['#', 'Store', 'Health', 'Status', 'Main risk']}
          rows={data.topRiskStores.map(s => [String(s.rank), s.store.storeName, `${s.store.finalHealthScore}%`, s.store.finalRag, s.store.mainIssue])} />

        <ReportTable title="Executive Decisions Required" head={['Category', 'Decision', 'Reason', 'Owner', 'Due']}
          rows={data.decisions.map(d => [d.category, d.decisionRequired, d.reason, d.owner, `${d.deadlineDays}d`])} />

        {data.repeatDefects.length > 0 && (
          <ReportTable title="Repeat Defects" head={['Category', 'Store', 'Repeats', 'Suggested action']}
            rows={data.repeatDefects.map(d => [d.category, d.storeName, String(d.count), d.suggestedAction])} />
        )}
      </article>
    </div>
  )
}

function ReportTable({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <section>
      <h3 className="font-bold text-gray-900 dark:text-white mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
              {head.map(h => <th key={h} className="py-1.5 pr-3">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={head.length} className="py-3 text-gray-400">Nothing to report.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 align-top">
                {r.map((c, j) => <td key={j} className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
