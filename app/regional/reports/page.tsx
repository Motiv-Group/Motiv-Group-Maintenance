export const dynamic = 'force-dynamic'

import { FileBarChart } from 'lucide-react'
import { requireRegionalV3 } from '@/lib/health/guard'
import { assembleRegionalDashboard } from '@/lib/health/data'
import { PrintButton } from '@/components/dashboards/PrintButton'
import { STATUS_LABELS } from '@/lib/health/constants'
import { formatCurrency, formatDateTime } from '@/lib/utils'

const fmtK = (n: number) => n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n)

export default async function RegionalReportsPage() {
  const { companyId, regionIds } = await requireRegionalV3()
  const d = await assembleRegionalDashboard(companyId, regionIds)
  const p = d.portfolio

  return (
    <div className="space-y-5">
      {/* Stacks on phones — the title + PrintButton need ~410px side by side. */}
      <div className="flex flex-col items-start gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-xl font-bold text-[var(--text)] flex items-center gap-2 sm:text-2xl"><FileBarChart className="text-slate-600 dark:text-slate-400" size={22} /> Regional Report</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Portfolio summary for your region. Print or save as PDF.</p></div>
        <PrintButton />
      </div>
      <article className="bg-white text-slate-900 rounded-2xl p-5 sm:p-8 space-y-6 print:p-0">
        <header className="border-b border-slate-200 pb-4">
          <h2 className="text-2xl font-bold">Regional Portfolio Report</h2>
          <p className="text-sm text-[var(--text-faint)]">Generated {formatDateTime(d.generatedAt)}</p>
        </header>
        <section>
          <h3 className="font-bold mb-1">Portfolio Health: {p.finalPortfolioHealth}% — {STATUS_LABELS[p.status]}</h3>
          <p className="text-sm text-slate-600">Average store health {p.averageStoreHealth}% − penalty {p.riskPenalty}. {p.activeStores} stores · {p.counts.controlled} controlled / {p.counts.attention} attention / {p.counts.at_risk} at risk / {p.counts.critical} critical. {p.mainReason}.</p>
        </section>
        <section>
          <h3 className="font-bold mb-2">Stores</h3>
          {/* Wide print-style table: scrolls inside its own container on phones so the
              page body never scrolls horizontally. */}
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs border-collapse">
            <thead><tr className="text-left text-[var(--text-faint)] border-b border-slate-200"><th className="py-1.5 pr-3">Store</th><th className="py-1.5 pr-3">Health</th><th className="py-1.5 pr-3">Status</th><th className="py-1.5 pr-3">Open</th><th className="py-1.5 pr-3">Overdue</th><th className="py-1.5 pr-3">Exposure</th><th className="py-1.5 pr-3">Main Driver</th></tr></thead>
            <tbody>
              {d.stores.map(s => (
                <tr key={s.storeId} className="border-b border-slate-100"><td className="py-1.5 pr-3">{s.storeName}</td><td className="py-1.5 pr-3">{s.finalHealthScore}%</td><td className="py-1.5 pr-3">{STATUS_LABELS[s.finalStatus]}</td><td className="py-1.5 pr-3">{s.openTickets}</td><td className="py-1.5 pr-3">{s.overdueTickets}</td><td className="py-1.5 pr-3">{fmtK(s.costExposure)}</td><td className="py-1.5 pr-3">{s.mainIssue}</td></tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      </article>
    </div>
  )
}
