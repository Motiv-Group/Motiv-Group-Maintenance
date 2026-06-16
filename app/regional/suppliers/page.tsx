export const dynamic = 'force-dynamic'

import { Truck } from 'lucide-react'
import { requireRegionalV3 } from '@/lib/health/guard'
import { assembleRegionalDashboard } from '@/lib/health/data'
import { SectionCard, Pill, STATUS_TEXT } from '@/components/exec/ui'
import { ProvisionPanel } from '@/components/exec/ProvisionPanel'
import { formatCurrency } from '@/lib/utils'

const fmtK = (n: number) => n ? (n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n)) : 'R 0'

export default async function RegionalSuppliersPage() {
  const { companyId, regionIds } = await requireRegionalV3()
  const { suppliers } = await assembleRegionalDashboard(companyId, regionIds)

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-white flex items-center gap-2"><Truck className="text-[#C6A35D]" size={22} /> Suppliers</h1>
        <p className="text-sm text-slate-400 mt-0.5">Suppliers active on tickets in your region.</p></div>
      <ProvisionPanel mode="suppliers" />
      <SectionCard title="Supplier Performance in Region">
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="text-left text-[11px] text-slate-500 border-b border-white/5">
              <th className="py-2 px-2">Supplier</th><th className="px-2">SLA</th><th className="px-2">Status</th><th className="px-2">Open</th><th className="px-2">Overdue</th>
              <th className="px-2">First-fix</th><th className="px-2">Repeat</th><th className="px-2">Escal.</th><th className="px-2">Exposure</th>
            </tr></thead>
            <tbody>
              {suppliers.map(s => (
                <tr key={s.id} className="border-b border-white/5">
                  <td className="py-2.5 px-2 text-white">{s.name}</td>
                  <td className={`px-2 font-semibold ${STATUS_TEXT[s.perf.band]}`}>{s.perf.performanceScore}%</td>
                  <td className="px-2"><Pill status={s.perf.band} /></td>
                  <td className="px-2 text-slate-300">{s.open}</td><td className="px-2 text-red-400">{s.overdue}</td>
                  <td className="px-2 text-slate-300">{Math.round(s.perf.firstTimeFixRate * 100)}%</td>
                  <td className="px-2 text-slate-300">{s.perf.repeatDefectInvolvement}</td>
                  <td className="px-2 text-slate-300">{s.perf.escalationCount}</td>
                  <td className="px-2 text-slate-300 whitespace-nowrap">{fmtK(s.costExposure)}</td>
                </tr>
              ))}
              {!suppliers.length && <tr><td colSpan={9} className="py-6 text-center text-slate-500">No suppliers active in your region yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
