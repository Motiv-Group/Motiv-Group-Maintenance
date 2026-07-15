// Read-only "metric by store" breakdown used by the executive KPI drill-down
// pages (Open Work, Internal Breaches, Repeat Defects, Cost Exposure). Server-safe.
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { Pill } from '@/components/exec/ui'
import type { HealthStatus } from '@/lib/health/types'

export interface MetricRow {
  storeId: string
  storeName: string
  regionName: string
  status: HealthStatus
  raw: number
  value: string
}

export function StoreMetricBreakdown({ title, subtitle, icon, rows, valueLabel, total }: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  rows: MetricRow[]
  valueLabel?: string
  total?: string
}) {
  const shown = rows.filter(r => r.raw > 0).sort((a, b) => b.raw - a.raw)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">{icon}{title}</h1>
          {subtitle && <p className="text-sm text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
        </div>
      </div>

      {total && (
        <div className="rounded-2xl ring-1 ring-[var(--border)] bg-[var(--surface)] p-4">
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Estate total</div>
          <div className="text-2xl font-bold text-[var(--text)] mt-0.5">{total}</div>
          <div className="text-[11px] text-[var(--text-muted)]">{shown.length} store{shown.length === 1 ? '' : 's'} contributing</div>
        </div>
      )}

      <div className="rounded-2xl ring-1 ring-[var(--border)] bg-[var(--surface)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]">
              <th className="py-2 px-3">#</th><th className="px-3">Store</th><th className="px-3">Region</th><th className="px-3">Health</th><th className="px-3 text-right">{valueLabel ?? 'Value'}</th>
            </tr></thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.storeId} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)]">
                  <td className="py-2.5 px-3 text-[var(--text-faint)]">{i + 1}</td>
                  <td className="px-3"><Link href="/executive/stores" className="text-[var(--text)] hover:text-blue-500">{r.storeName}</Link></td>
                  <td className="px-3 text-[var(--text-muted)]">{r.regionName}</td>
                  <td className="px-3"><Pill status={r.status} /></td>
                  <td className="px-3 text-right font-semibold text-[var(--text)] tabular-nums whitespace-nowrap">{r.value}</td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={5} className="py-8 text-center text-[var(--text-faint)]">Nothing to show — all clear across the estate.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
