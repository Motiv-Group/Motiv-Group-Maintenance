export const dynamic = 'force-dynamic'

import { ReceiptText, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard, type SupplierQuoteRow } from '@/lib/health/data'
import { formatCurrency, formatDateTime } from '@/lib/utils'

const TONE: Record<string, string> = { pending: 'text-[#C6A35D]', accepted: 'text-emerald-600 dark:text-emerald-400', declined: 'text-red-600 dark:text-red-400', revision_requested: 'text-blue-600 dark:text-blue-400' }

export default async function SupplierQuotesPage() {
  const { companyId, supplierIds } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)

  // Group quotes by company / store.
  const byStore = new Map<string, SupplierQuoteRow[]>()
  for (const q of d.quotes) { const a = byStore.get(q.storeName) ?? []; a.push(q); byStore.set(q.storeName, a) }
  const groups = [...byStore.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><ReceiptText className="text-amber-600 dark:text-amber-500" size={22} /> Quotes</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Quotes you have submitted, grouped by company. Amounts show whether they include VAT.</p></div>

      {!groups.length && (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
          <ReceiptText size={28} className="mx-auto text-[var(--text-faint)] mb-2" />
          <p className="text-sm text-[var(--text-faint)]">No quotes submitted yet.</p>
        </div>
      )}

      {groups.map(([store, quotes]) => (
        <details key={store} open className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none hover:bg-[var(--hover)] transition">
            <Building2 size={16} className="text-[#C6A35D] shrink-0" />
            <span className="flex-1 min-w-0 text-sm font-bold text-[var(--text)] truncate">{store}</span>
            <span className="text-[11px] font-semibold text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5 shrink-0">{quotes.length} quote{quotes.length !== 1 ? 's' : ''}</span>
            <ChevronDown size={16} className="text-[var(--text-faint)] shrink-0 group-open:hidden" />
            <ChevronUp size={16} className="text-[var(--text-faint)] shrink-0 hidden group-open:block" />
          </summary>
          <div className="border-t border-[var(--border)] overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]"><th className="py-2 px-3">Quote</th><th className="px-3">Amount</th><th className="px-3">Status</th><th className="px-3">Submitted</th></tr></thead>
              <tbody>
                {quotes.map(q => (
                  <tr key={q.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5 px-3 text-[var(--text)] max-w-[260px] truncate">{q.ticketTitle}</td>
                    <td className="px-3">
                      <span className="text-[var(--text)]">{formatCurrency(q.amountInclVat ?? q.amount)}</span>
                      <span className={`ml-1.5 text-[10px] font-semibold uppercase rounded-full px-1.5 py-0.5 ${q.amountInclVat ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>{q.amountInclVat ? 'incl VAT' : 'excl VAT'}</span>
                    </td>
                    <td className={`px-3 capitalize ${TONE[q.status] ?? 'text-[var(--text)]'}`}>{q.status.replace('_', ' ')}</td>
                    <td className="px-3 text-[var(--text-muted)] text-xs whitespace-nowrap">{formatDateTime(q.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  )
}
