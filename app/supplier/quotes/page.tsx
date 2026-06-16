export const dynamic = 'force-dynamic'

import { ReceiptText } from 'lucide-react'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { SectionCard } from '@/components/exec/ui'
import { formatCurrency, formatDate } from '@/lib/utils'

const TONE: Record<string, string> = { pending: 'text-[#C6A35D]', accepted: 'text-emerald-400', declined: 'text-red-400', revision_requested: 'text-blue-400' }

export default async function SupplierQuotesPage() {
  const { companyId, supplierIds } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-white flex items-center gap-2"><ReceiptText className="text-[#C6A35D]" size={22} /> Quotes</h1>
        <p className="text-sm text-slate-400 mt-0.5">Quotes you have submitted and their decision status.</p></div>
      <SectionCard title={`Quotes (${d.quotes.length})`}>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-left text-[11px] text-slate-500 border-b border-white/5"><th className="py-2 px-2">Ticket</th><th className="px-2">Amount</th><th className="px-2">Status</th><th className="px-2">Submitted</th></tr></thead>
            <tbody>
              {d.quotes.map(q => (
                <tr key={q.id} className="border-b border-white/5">
                  <td className="py-2.5 px-2 text-white max-w-[280px] truncate">{q.ticketTitle}</td>
                  <td className="px-2 text-slate-300">{formatCurrency(q.amount)}</td>
                  <td className={`px-2 capitalize ${TONE[q.status] ?? 'text-slate-300'}`}>{q.status.replace('_', ' ')}</td>
                  <td className="px-2 text-slate-400 text-xs">{formatDate(q.createdAt)}</td>
                </tr>
              ))}
              {!d.quotes.length && <tr><td colSpan={4} className="py-6 text-center text-slate-500">No quotes submitted yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
