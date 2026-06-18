export const dynamic = 'force-dynamic'

import { ReceiptText } from 'lucide-react'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { SectionCard } from '@/components/exec/ui'
import { formatCurrency, formatDate } from '@/lib/utils'

const TONE: Record<string, string> = { pending: 'text-[#C6A35D]', accepted: 'text-emerald-600 dark:text-emerald-400', declined: 'text-red-600 dark:text-red-400', revision_requested: 'text-blue-600 dark:text-blue-400' }

export default async function SupplierQuotesPage() {
  const { companyId, supplierIds } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><ReceiptText className="text-amber-600 dark:text-amber-500" size={22} /> Quotes</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Quotes you have submitted and their decision status.</p></div>
      <SectionCard title={`Quotes (${d.quotes.length})`}>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]"><th className="py-2 px-2">Ticket</th><th className="px-2">Amount</th><th className="px-2">Status</th><th className="px-2">Submitted</th></tr></thead>
            <tbody>
              {d.quotes.map(q => (
                <tr key={q.id} className="border-b border-[var(--border)]">
                  <td className="py-2.5 px-2 text-[var(--text)] max-w-[280px] truncate">{q.ticketTitle}</td>
                  <td className="px-2 text-[var(--text)]">{formatCurrency(q.amount)}</td>
                  <td className={`px-2 capitalize ${TONE[q.status] ?? 'text-[var(--text)]'}`}>{q.status.replace('_', ' ')}</td>
                  <td className="px-2 text-[var(--text-muted)] text-xs">{formatDate(q.createdAt)}</td>
                </tr>
              ))}
              {!d.quotes.length && <tr><td colSpan={4} className="py-6 text-center text-[var(--text-faint)]">No quotes submitted yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
