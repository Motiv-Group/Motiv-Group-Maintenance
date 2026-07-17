export const dynamic = 'force-dynamic'

import { FileBarChart } from 'lucide-react'
import { requireExecutiveV3 } from '@/lib/health/guard'
import { assembleEstateDashboard } from '@/lib/health/data'
import { STATUS_LABELS } from '@/lib/health/constants'
import { PrintButton } from '@/components/ui/PrintButton'
import { formatCurrency, formatDateTime } from '@/lib/utils'

const fmtK = (n: number) => n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n)

export default async function ExecutiveReportsPage() {
  const { companyId } = await requireExecutiveV3()
  const d = await assembleEstateDashboard(companyId)
  const e = d.estate

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><FileBarChart className="text-slate-600 dark:text-slate-400" size={22} /> Executive Report</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Exception-based estate summary. Print or save as PDF.</p>
        </div>
        <PrintButton />
      </div>

      <article className="bg-white text-slate-900 rounded-2xl p-8 space-y-6 print:p-0">
        <header className="border-b border-slate-200 pb-4">
          <h2 className="text-2xl font-bold">Estate Maintenance Report</h2>
          <p className="text-sm text-[var(--text-faint)]">Generated {formatDateTime(d.generatedAt)}</p>
        </header>

        <section>
          <h3 className="font-bold mb-1">Estate Health: {e.finalEstateHealth}% — {STATUS_LABELS[e.status]}</h3>
          <p className="text-sm text-slate-600">
            Weighted regional health {e.weightedRegionalHealth}% − penalty {e.riskPenalty}. Main driver: {e.mainRiskDriver}.
            {' '}{e.totalActiveStores} active stores · {d.regions.length} regions ·
            {' '}{e.counts.controlled} controlled / {e.counts.attention} attention / {e.counts.at_risk} at risk / {e.counts.critical} critical.
          </p>
        </section>

        <ReportTable title="Regional Ranking" head={['#', 'Region', 'Health', 'Status', 'Stores', 'Red/Crit', 'Open', 'Cost']}
          rows={d.regions.map(r => [String(r.rank), r.regionName, `${r.region.finalPortfolioHealth}%`, STATUS_LABELS[r.region.status], String(r.region.activeStores), `${r.region.counts.at_risk}/${r.region.counts.critical}`, String(r.region.openTickets), fmtK(r.region.costExposure)])} />

        <ReportTable title="Top Risk Stores" head={['#', 'Store', 'Region', 'Health', 'Status', 'Main Driver']}
          rows={d.topRiskStores.map((s, i) => [String(i + 1), s.storeName, s.regionName, `${s.finalHealthScore}%`, STATUS_LABELS[s.finalStatus], s.mainIssue])} />

        <ReportTable title="Executive Decisions Required" head={['Priority', 'Type', 'Decision', 'Exposure', 'Owner', 'Due']}
          rows={d.decisions.map(x => [x.band, x.category, x.title, x.exposureValue ? fmtK(x.exposureValue) : '—', x.owner, `${x.deadlineDays}d`])} />

        <ReportTable title="Supplier Performance" head={['Supplier', 'SLA', 'Open', 'Overdue', 'First-fix', 'Exposure']}
          rows={d.suppliers.map(s => [s.name, `${s.perf.performanceScore}%`, String(s.open), String(s.overdue), `${Math.round(s.perf.firstTimeFixRate * 100)}%`, fmtK(s.costExposure)])} />

        {d.repeatDefects.length > 0 && (
          <ReportTable title="Repeat Defects" head={['Category', 'Store', 'Region', 'Count', 'Suggested Action']}
            rows={d.repeatDefects.map(x => [x.category, x.storeName, x.regionName, String(x.count), x.suggestedAction])} />
        )}
      </article>
    </div>
  )
}

function ReportTable({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <section>
      <h3 className="font-bold mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead><tr className="text-left text-[var(--text-faint)] border-b border-slate-200">{head.map(h => <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {rows.length ? rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100 align-top">{r.map((c, j) => <td key={j} className="py-1.5 pr-3">{c}</td>)}</tr>
            )) : <tr><td colSpan={head.length} className="py-3 text-[var(--text-muted)]">Nothing to report.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
