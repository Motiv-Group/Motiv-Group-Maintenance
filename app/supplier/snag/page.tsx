export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { AlertTriangle, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard, type SupplierTicketRow } from '@/lib/health/data'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { rmStatusMeta, formatDateTime } from '@/lib/utils'

const SNAG_STATUSES = ['snag', 'snag_assigned', 'snag_resolved', 'snag_in_progress']

export default async function SupplierSnagPage() {
  const { companyId, supplierIds } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)
  const snags = d.tickets.filter(t => SNAG_STATUSES.includes(t.status))

  const byStore = new Map<string, SupplierTicketRow[]>()
  for (const t of snags) { const a = byStore.get(t.storeName) ?? []; a.push(t); byStore.set(t.storeName, a) }
  const groups = [...byStore.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><AlertTriangle className="text-amber-500" size={22} /> Snags</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Jobs the manager raised a snag on — re-work or re-upload required. Tap a ticket to action it.</p>
      </div>

      {!groups.length ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
          <AlertTriangle size={28} className="mx-auto text-[var(--text-faint)] mb-2" />
          <p className="text-sm text-[var(--text-faint)]">No snags — all sign-offs are clear.</p>
        </div>
      ) : (
        groups.map(([store, rows]) => (
          <details key={store} open className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none hover:bg-[var(--hover)] transition">
              <Building2 size={16} className="text-amber-500 shrink-0" />
              <span className="flex-1 min-w-0 text-sm font-bold text-[var(--text)] truncate">{store}</span>
              <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/15 rounded-full px-2 py-0.5 shrink-0">{rows.length} snag{rows.length !== 1 ? 's' : ''}</span>
              <ChevronDown size={16} className="text-[var(--text-faint)] shrink-0 group-open:hidden" />
              <ChevronUp size={16} className="text-[var(--text-faint)] shrink-0 hidden group-open:block" />
            </summary>
            <div className="border-t border-[var(--border)] px-3">
              {rows.map(t => {
                const sm = rmStatusMeta(t.status)
                return (
                  <Link key={t.id} href={`/supplier/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2.5 -mx-0 px-1 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--text)] truncate">{t.title}</p>
                      <p className="text-[11px] text-[var(--text-faint)]">Logged {formatDateTime(t.createdAt)}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_7rem] gap-1.5 shrink-0 justify-items-end sm:justify-items-stretch">
                      <PriorityBadge priority={t.priority} className="w-full text-center" />
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${sm.cls}`}>{sm.label}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </details>
        ))
      )}
    </div>
  )
}
