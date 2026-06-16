export const dynamic = 'force-dynamic'

import { Truck } from 'lucide-react'
import { requireExecutive } from '@/lib/dashboards/guard'
import { assembleEstateDashboard } from '@/lib/dashboards/data'
import { RagBadge } from '@/components/dashboards/primitives'

function fmtMins(m: number | null): string {
  if (m == null) return '—'
  if (m < 60) return `${Math.round(m)}m`
  if (m < 1440) return `${(m / 60).toFixed(1)}h`
  return `${(m / 1440).toFixed(1)}d`
}
const pct = (x: number) => `${Math.round(x * 100)}%`

export default async function ExecutiveSuppliersPage() {
  await requireExecutive()
  const data = await assembleEstateDashboard()

  const best = [...data.suppliers].sort((a, b) => b.perf.performanceScore - a.perf.performanceScore).slice(0, 3)
  const worst = data.suppliers.filter(s => s.perf.band === 'red' || s.perf.band === 'critical').slice(0, 5)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Truck size={20} className="text-brand-600 dark:text-brand-300" /> Supplier Performance
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Estate-wide. Score weighs SLA breaches, first-time-fix, evidence, repeat defects and escalations.</p>
      </div>

      {data.suppliers.length === 0 ? (
        <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center text-sm text-gray-400">
          No tickets are linked to a sub-supplier yet. Assign suppliers on tickets to populate this.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
              <h2 className="text-sm font-semibold text-green-600 dark:text-green-400 mb-2">Best performing</h2>
              <ul className="space-y-1.5 text-sm">
                {best.map(s => (
                  <li key={s.id} className="flex justify-between"><span className="text-gray-900 dark:text-white">{s.name}</span><span className="font-semibold">{s.perf.performanceScore}%</span></li>
                ))}
              </ul>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
              <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">Underperforming</h2>
              {worst.length === 0 ? <p className="text-xs text-gray-400">None flagged.</p> : (
                <ul className="space-y-1.5 text-sm">
                  {worst.map(s => (
                    <li key={s.id} className="flex justify-between"><span className="text-gray-900 dark:text-white">{s.name}</span><span className="font-semibold">{s.perf.performanceScore}%</span></li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-3 overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100 dark:border-gray-700">
                  <th className="py-2 px-2">Supplier</th><th className="px-2">Assigned</th><th className="px-2">Done</th>
                  <th className="px-2">SLA breaches</th><th className="px-2">Avg resp.</th><th className="px-2">Avg resolve</th>
                  <th className="px-2">First-fix</th><th className="px-2">Repeat</th><th className="px-2">Evidence</th>
                  <th className="px-2">Escal.</th><th className="px-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {data.suppliers.map(({ id, name, perf }) => (
                  <tr key={id} className="border-b border-gray-50 dark:border-gray-700/50">
                    <td className="py-2 px-2 font-medium text-gray-900 dark:text-white">{name}</td>
                    <td className="px-2">{perf.assignedTickets}</td>
                    <td className="px-2">{perf.completedTickets}</td>
                    <td className="px-2 text-red-600 dark:text-red-400">{perf.slaBreaches}</td>
                    <td className="px-2">{fmtMins(perf.avgResponseMins)}</td>
                    <td className="px-2">{fmtMins(perf.avgResolutionMins)}</td>
                    <td className="px-2">{pct(perf.firstTimeFixRate)}</td>
                    <td className="px-2">{perf.repeatDefectInvolvement}</td>
                    <td className="px-2">{pct(perf.evidenceCompletionRate)}</td>
                    <td className="px-2">{perf.escalationCount}</td>
                    <td className="px-2"><span className="inline-flex items-center gap-1.5"><span className="font-semibold">{perf.performanceScore}</span><RagBadge rag={perf.band} label={perf.band} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
