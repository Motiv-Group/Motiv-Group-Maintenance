export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ClipboardCheck, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard, type SupplierSignoffRow } from '@/lib/health/data'
import { formatDateTime } from '@/lib/utils'

const TONE: Record<string, string> = { submitted: 'text-[#C6A35D]', awaiting_regional: 'text-[#C6A35D]', awaiting_store: 'text-blue-600 dark:text-blue-400', accepted: 'text-emerald-600 dark:text-emerald-400', rejected: 'text-red-600 dark:text-red-400' }
const WORD: Record<string, string> = { submitted: 'More info', awaiting_regional: 'More info', awaiting_store: 'More info', accepted: 'Accepted', rejected: 'Rejected' }
const NEUTRAL = { active: 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-[#0a0e17] dark:border-white', inactive: 'text-[var(--text-muted)] border-[var(--border)] hover:border-slate-400' }
const FILTERS: { key: string; label: string; active: string; inactive: string }[] = [
  { key: 'all', label: 'All', ...NEUTRAL },
  { key: 'awaiting', label: 'Awaiting', active: 'bg-[#C6A35D] text-[#0a0e17] border-[#C6A35D]', inactive: 'text-amber-600 dark:text-[#C6A35D] border-[#C6A35D]/40 hover:border-[#C6A35D]' },
  { key: 'accepted', label: 'Accepted', active: 'bg-emerald-500 text-white border-emerald-500', inactive: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 hover:border-emerald-400' },
  { key: 'rejected', label: 'Rejected', active: 'bg-red-500 text-white border-red-500', inactive: 'text-red-600 dark:text-red-400 border-red-500/40 hover:border-red-400' },
]
const AWAITING = new Set(['submitted', 'awaiting_regional', 'awaiting_store'])
const matchesFilter = (status: string, f: string) => f === 'all' || (f === 'awaiting' ? AWAITING.has(status) : status === f)

export default async function SupplierSignoffPage({ searchParams }: { searchParams?: { status?: string } }) {
  const { companyId, supplierIds } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)
  const active = FILTERS.some(f => f.key === searchParams?.status) ? searchParams!.status! : 'all'
  // Show the full sign-off history incl. accepted (approved) completions.
  const visible = d.signoffs
  const signoffsShown = visible.filter(s => matchesFilter(s.status, active))

  // Group sign-offs by store (within the supplier's single client company).
  const byStore = new Map<string, SupplierSignoffRow[]>()
  for (const s of signoffsShown) { const a = byStore.get(s.storeName) ?? []; a.push(s); byStore.set(s.storeName, a) }
  const groups = [...byStore.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><ClipboardCheck className="text-emerald-600 dark:text-emerald-400" size={22} /> Signoff</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Jobs you submitted for completion sign-off, grouped by store. Tap a job to open its ticket. You cannot mark jobs complete — the company confirms.</p></div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <Link key={f.key} href={f.key === 'all' ? '/supplier/signoff' : `/supplier/signoff?status=${f.key}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${active === f.key ? f.active : f.inactive}`}>
            {f.label}
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
        <details key={store} className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none hover:bg-[var(--hover)] transition">
            <Building2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="flex-1 min-w-0 text-sm font-bold text-[var(--text)] truncate">{[d.company, store].filter(Boolean).join(' · ')}{rows[0].branchCode ? ` · ${rows[0].branchCode}` : ''}</span>
            <span className="text-[11px] font-semibold text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5 shrink-0">{rows.length} job{rows.length !== 1 ? 's' : ''}</span>
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
                <span className={`text-[11px] font-semibold shrink-0 ${TONE[s.status] ?? 'text-[var(--text-muted)]'}`}>{WORD[s.status] ?? s.status}</span>
              </Link>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}
