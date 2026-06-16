export const dynamic = 'force-dynamic'

import { ClipboardCheck } from 'lucide-react'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { SectionCard } from '@/components/exec/ui'
import { formatDate } from '@/lib/utils'

const TONE: Record<string, string> = { submitted: 'text-[#C6A35D]', awaiting_regional: 'text-[#C6A35D]', awaiting_store: 'text-blue-400', accepted: 'text-emerald-400', rejected: 'text-red-400' }
const WORD: Record<string, string> = { submitted: 'Submitted', awaiting_regional: 'Awaiting Regional', awaiting_store: 'Awaiting Store', accepted: 'Accepted', rejected: 'Rejected — more evidence' }

export default async function SupplierSignoffPage() {
  const { companyId, supplierIds } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-white flex items-center gap-2"><ClipboardCheck className="text-[#C6A35D]" size={22} /> Pending Sign-off</h1>
        <p className="text-sm text-slate-400 mt-0.5">Jobs you submitted for completion sign-off. You cannot mark jobs complete — the company confirms.</p></div>
      <SectionCard title={`Submitted for Sign-off (${d.signoffs.length})`}>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="text-left text-[11px] text-slate-500 border-b border-white/5"><th className="py-2 px-2">Ticket</th><th className="px-2">Status</th><th className="px-2">Submitted</th></tr></thead>
            <tbody>
              {d.signoffs.map(s => (
                <tr key={s.id} className="border-b border-white/5">
                  <td className="py-2.5 px-2 text-white max-w-[300px] truncate">{s.ticketTitle}</td>
                  <td className={`px-2 ${TONE[s.status] ?? 'text-slate-300'}`}>{WORD[s.status] ?? s.status}</td>
                  <td className="px-2 text-slate-400 text-xs">{formatDate(s.createdAt)}</td>
                </tr>
              ))}
              {!d.signoffs.length && <tr><td colSpan={3} className="py-6 text-center text-slate-500">Nothing submitted for sign-off yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
