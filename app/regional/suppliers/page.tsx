export const dynamic = 'force-dynamic'

import { Truck } from 'lucide-react'
import { requireRegionalV3 } from '@/lib/health/guard'
import { assembleRegionalDashboard, type RegionalDashboardData } from '@/lib/health/data'
import { SectionCard, Pill, STATUS_TEXT } from '@/components/exec/ui'
import { ProvisionPanel } from '@/components/exec/ProvisionPanel'
import { ResponsiveTable, type RTColumn } from '@/components/dashboards/ResponsiveTable'
import { formatCurrency } from '@/lib/utils'

const fmtK = (n: number) => n ? (n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n)) : 'R 0'

type Row = RegionalDashboardData['suppliers'][number]

export default async function RegionalSuppliersPage() {
  const { companyId, regionIds } = await requireRegionalV3()
  const { suppliers } = await assembleRegionalDashboard(companyId, regionIds)

  const cols: RTColumn<Row>[] = [
    { header: 'Supplier', role: 'title', cell: s => <span className="font-medium text-[var(--text)]">{s.name}</span> },
    { header: 'SLA', role: 'badge', cell: s => <span className={`text-sm font-semibold ${STATUS_TEXT[s.perf.band]}`}>{s.perf.performanceScore}%</span> },
    { header: 'Status', role: 'badge', cell: s => <Pill status={s.perf.band} /> },
    { header: 'Open', cell: s => <span className="text-[var(--text-muted)]">{s.open}</span> },
    { header: 'Overdue', cell: s => <span className="text-red-500">{s.overdue}</span> },
    { header: 'First-fix', cell: s => <span className="text-[var(--text-muted)]">{Math.round(s.perf.firstTimeFixRate * 100)}%</span> },
    { header: 'Repeat', cell: s => <span className="text-[var(--text-muted)]">{s.perf.repeatDefectInvolvement}</span> },
    { header: 'Escalations', cell: s => <span className="text-[var(--text-muted)]">{s.perf.escalationCount}</span> },
    { header: 'Exposure', cell: s => <span className="text-[var(--text-muted)] whitespace-nowrap">{fmtK(s.costExposure)}</span> },
  ]

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Truck className="text-[#C6A35D]" size={22} /> Suppliers</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Suppliers active on tickets in your region.</p></div>
      <ProvisionPanel mode="suppliers" />
      <SectionCard title="Supplier Performance in Region">
        <ResponsiveTable columns={cols} rows={suppliers} getKey={s => s.id} minWidth={760} empty="No suppliers active in your region yet." />
      </SectionCard>
    </div>
  )
}
