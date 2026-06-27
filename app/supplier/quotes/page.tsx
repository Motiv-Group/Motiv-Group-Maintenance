export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ReceiptText, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard, type SupplierQuoteRow } from '@/lib/health/data'
import { formatCurrency, formatDateTime } from '@/lib/utils'

const TONE: Record<string, string> = { pending: 'text-[#C6A35D]', accepted: 'text-emerald-600 dark:text-emerald-400', declined: 'text-red-600 dark:text-red-400', revision_requested: 'text-blue-600 dark:text-blue-400' }

export default async function SupplierQuotesPage() {
  const { companyId, supplierIds } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)

  // Group quotes by store (within the supplier's single client company).
  const byStore = new Map<string, SupplierQuoteRow[]>()
  for (const q of d.quotes) { const a = byStore.get(q.storeName) ?? []; a.push(q); byStore.set(q.storeName, a) }
  const groups = [...byStore.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><ReceiptText className="text-amber-600 dark:text-amber-500" size={22} /> Quotes</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Quotes you have submitted, grouped by store. Tap a quote to open its ticket. Amounts show whether they include VAT.</p></div>

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
            <div className="flex-1 min-w-0">
              {d.company && <p className="text-[10px] text-[var(--text-faint)] truncate">{d.company}</p>}
              <p className="text-sm font-bold text-[var(--text)] truncate">{store}{quotes[0].branchCode ? ` · ${quotes[0].branchCode}` : ''}</p>
            </div>
            <span className="text-[11px] font-semibold text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5 shrink-0">{quotes.length} quote{quotes.length !== 1 ? 's' : ''}</span>
            <ChevronDown size={16} className="text-[var(--text-faint)] shrink-0 group-open:hidden" />
            <ChevronUp size={16} className="text-[var(--text-faint)] shrink-0 hidden group-open:block" />
          </summary>
          <div className="border-t border-[var(--border)]">
            {quotes.map(q => (
              <Link key={q.id} href={`/supplier/tickets/${q.ticketId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
                <div className="min-w-0">
                  <p className="text-sm text-[var(--text)] truncate">{q.ticketTitle}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(q.createdAt)}</p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-sm text-[var(--text)] tabular-nums whitespace-nowrap">{formatCurrency(q.amountInclVat ?? q.amount)}</span>
                  <span className={`text-[10px] font-semibold uppercase rounded-full px-1.5 py-0.5 ${q.amountInclVat ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>{q.amountInclVat ? 'incl VAT' : 'excl VAT'}</span>
                  <span className={`text-[11px] capitalize ${TONE[q.status] ?? 'text-[var(--text-muted)]'}`}>{q.status.replace('_', ' ')}</span>
                </div>
              </Link>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}
