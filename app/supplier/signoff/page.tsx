export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ClipboardCheck, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard, type SupplierSignoffRow } from '@/lib/health/data'
import { PersistentDetails } from '@/components/ui/PersistentDetails'
import { formatDateTime } from '@/lib/utils'

// Small status-chip tints per sign-off state — waiting states are amber, never gold.
const TONE: Record<string, string> = { submitted: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', awaiting_regional: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', awaiting_store: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', accepted: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', rejected: 'bg-red-500/15 text-red-700 dark:text-red-400' }
const WORD: Record<string, string> = { submitted: 'More info', awaiting_regional: 'More info', awaiting_store: 'More info', accepted: 'Accepted', rejected: 'Rejected' }
const NEUTRAL = { active: 'bg-gray-500 text-white', inactive: 'bg-gray-500/15 text-gray-600 dark:text-gray-400' }
const FILTERS: { key: string; label: string; active: string; inactive: string }[] = [
  { key: 'all', label: 'All', ...NEUTRAL },
  { key: 'awaiting', label: 'Awaiting', active: 'bg-blue-500 text-white', inactive: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  { key: 'accepted', label: 'Accepted', active: 'bg-emerald-500 text-white', inactive: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  { key: 'rejected', label: 'Rejected', active: 'bg-red-500 text-white', inactive: 'bg-red-500/15 text-red-700 dark:text-red-400' },
]
const AWAITING = new Set(['submitted', 'awaiting_regional', 'awaiting_store'])
const matchesFilter = (status: string, f: string) => f === 'all' || (f === 'awaiting' ? AWAITING.has(status) : status === f)

export default async function SupplierSignoffPage(props: { searchParams?: Promise<{ status?: string }> }) {
  const searchParams = await props.searchParams;
  const { companyId, supplierIds } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)
  const active = FILTERS.some(f => f.key === searchParams?.status) ? searchParams!.status! : 'all'
  // Show the full sign-off history incl. accepted (approved) completions.
  const visible = d.signoffs
  const signoffsShown = visible.filter(s => matchesFilter(s.status, active))
  const filterCount = (key: string) => key === 'all' ? visible.length : visible.filter(s => matchesFilter(s.status, key)).length

  // Group sign-offs by store (within the supplier's single client company).
  const byStore = new Map<string, SupplierSignoffRow[]>()
  for (const s of signoffsShown) { const a = byStore.get(s.storeName) ?? []; a.push(s); byStore.set(s.storeName, a) }
  const groups = [...byStore.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><ClipboardCheck className="text-emerald-600 dark:text-emerald-400" size={22} /> Signoff</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Jobs you submitted for completion sign-off, grouped by store. Tap a job to open its ticket. You cannot mark jobs complete — the company confirms.</p></div>

      {/* Status filter */}
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {FILTERS.map(f => (
          <Link key={f.key} href={f.key === 'all' ? '/supplier/signoff' : `/supplier/signoff?status=${f.key}`}
            aria-pressed={active === f.key}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition text-center ${active === f.key ? f.active : f.inactive}`}>
            {f.label} <span className="opacity-70">{filterCount(f.key)}</span>
          </Link>
        ))}
      </div>

      {!groups.length && (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
          <ClipboardCheck size={28} className="mx-auto text-[var(--text-faint)] mb-2" />
          <p className="text-sm text-[var(--text-faint)]">{visible.length ? 'No sign-offs match this filter.' : 'No sign-offs yet.'}</p>
        </div>
      )}

      {groups.map(([store, rows]) => (
        <PersistentDetails key={store} persistKey={`supplier-signoff-${store}`} className="group rounded-2xl bg-[var(--surface)] ring-1 ring-black/10 dark:ring-white/10 shadow-sm overflow-hidden">
          <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none hover:bg-[var(--hover)] transition">
            <Building2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="flex-1 min-w-0 text-sm font-bold text-[var(--text)] truncate">{[d.company, store].filter(Boolean).join(' · ')}{rows[0].branchCode ? ` · ${rows[0].branchCode}` : ''}</span>
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-500/15 rounded-full px-2 py-0.5 shrink-0">{rows.length} job{rows.length !== 1 ? 's' : ''}</span>
            <ChevronDown size={16} className="text-[var(--text-faint)] shrink-0 group-open:hidden" />
            <ChevronUp size={16} className="text-[var(--text-faint)] shrink-0 hidden group-open:block" />
          </summary>
          <div className="border-t border-[var(--border)]">
            {rows.map(s => (
              <Link key={s.id} href={`/supplier/tickets/${s.ticketId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
                <div className="min-w-0">
                  <p className="text-sm text-[var(--text)] truncate">{s.ticketTitle}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(s.createdAt)}</p>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${TONE[s.status] ?? 'bg-slate-500/15 text-slate-600 dark:text-slate-300'}`}>{WORD[s.status] ?? s.status}</span>
              </Link>
            ))}
          </div>
        </PersistentDetails>
      ))}
    </div>
  )
}
