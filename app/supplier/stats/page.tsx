export const dynamic = 'force-dynamic'

import { BarChart2 } from 'lucide-react'
import { redirect } from 'next/navigation'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { Card, Donut, Pill, BreakdownList } from '@/components/exec/ui'

const clamp = (n: number) => Math.max(0, Math.min(20, Math.round(n)))

export default async function SupplierPerformancePage() {
  const { companyId, supplierIds } = await requireSupplierV3()
  if (!companyId) redirect('/supplier') // standalone self-signup supplier — see dashboard
  const { perf } = await assembleSupplierDashboard(companyId, supplierIds)
  const axes = {
    response: perf.avgResponseMins == null ? 14 : clamp(20 - perf.avgResponseMins / 60),
    completion: perf.avgResolutionMins == null ? 14 : clamp(20 - (perf.avgResolutionMins / 1440) * 1.5),
    firstFix: clamp(perf.firstTimeFixRate * 20),
    evidence: clamp(perf.evidenceCompletionRate * 20),
    communication: clamp(20 - perf.escalationCount * 3),
  }
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><BarChart2 className="text-slate-600 dark:text-slate-400" size={22} /> Performance</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Your SLA delivery and quality. Only your own data.</p></div>
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <Donut value={perf.performanceScore} status={perf.band} size={140} label="SLA" />
          <div className="flex-1 w-full space-y-3">
            <Pill status={perf.band} />
            <BreakdownList rows={[
              { label: 'Response Time', value: axes.response, max: 20 },
              { label: 'Completion Time', value: axes.completion, max: 20 },
              { label: 'First Time Fix', value: axes.firstFix, max: 20 },
              { label: 'Evidence Quality', value: axes.evidence, max: 20 },
              { label: 'Communication', value: axes.communication, max: 20 },
            ]} />
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { l: 'Assigned', v: perf.assignedTickets }, { l: 'Completed', v: perf.completedTickets },
          { l: 'SLA Breaches', v: perf.slaBreaches }, { l: 'Repeat Defects', v: perf.repeatDefectInvolvement },
          { l: 'First-Time Fix', v: `${Math.round(perf.firstTimeFixRate * 100)}%` }, { l: 'Evidence Rate', v: `${Math.round(perf.evidenceCompletionRate * 100)}%` },
          { l: 'Avg Response', v: perf.avgResponseMins == null ? '—' : `${(perf.avgResponseMins / 60).toFixed(1)}h` },
          { l: 'Escalations', v: perf.escalationCount },
        ].map(x => <Card key={x.l} className="p-4 text-center"><div className="text-2xl font-bold text-[var(--text)]">{x.v}</div><div className="text-[11px] text-[var(--text-muted)]">{x.l}</div></Card>)}
      </div>
    </div>
  )
}
