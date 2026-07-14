'use client'

// Supplier Quotes tab — a filterable / sortable / paginated table of quote
// requests + submitted quotes. The row icon is the ticket's trade icon, tinted by
// the ticket priority (CategoryIcon). All amounts are excl. VAT.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ReceiptText, Search, ChevronDown, ChevronLeft, ChevronRight, ChevronRight as Chev, Info, Calendar } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { CategoryIcon } from '@/components/client/ticketBadges'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'

export type QuoteKind = 'requested' | 'pending' | 'accepted' | 'declined'
export interface SupplierQuoteItem {
  key: string; ticketId: string; storeName: string; jobRef: string | null; category: string | null; priority: string; description: string | null
  kind: QuoteKind; at: string
  proposedVisit: string | null; validUntil: string | null; amount: number | null; amountInclVat: number | null
  declinedLabel?: string | null
  /** RM asked this supplier to re-submit after the decline (shown on the declined row). */
  reQuoteRequested?: boolean
}

const STATUS: Record<QuoteKind, { label: string; badge: string; tab: string; ring: string }> = {
  requested: { label: 'Quote requested', badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', tab: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', ring: 'ring-amber-500/40' },
  pending:   { label: 'Under review',    badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',    tab: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',    ring: 'ring-blue-500/40' },
  accepted:  { label: 'Approved',        badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', tab: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', ring: 'ring-emerald-500/40' },
  declined:  { label: 'Declined',        badge: 'bg-red-500/15 text-red-700 dark:text-red-400',       tab: 'bg-red-500/15 text-red-700 dark:text-red-400',       ring: 'ring-red-500/40' },
}
const ORDER: QuoteKind[] = ['requested', 'pending', 'accepted', 'declined']

// Ticket priority (engine P1–P4) → badge label/colour + sort rank (P1 = most urgent).
const PRIO: Record<string, { label: string; cls: string; rank: number }> = {
  P1: { label: 'Critical', cls: 'bg-red-500/15 text-red-700 dark:text-red-400',      rank: 0 },
  P2: { label: 'High',   cls: 'bg-orange-500/15 text-orange-700 dark:text-orange-400', rank: 1 },
  P3: { label: 'Medium', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',    rank: 2 },
  P4: { label: 'Low',    cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',    rank: 3 },
}
const rankOf = (p: string) => PRIO[p]?.rank ?? 9
// Shared badge geometry so the priority + status pills are exactly the same size.
const BADGE = 'inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide min-w-[96px]'

const SEL = 'appearance-none rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm pl-9 pr-8 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40'

export function SupplierQuotesTable({ items }: { items: SupplierQuoteItem[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<'all' | QuoteKind>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'urgent' | 'newest' | 'oldest' | 'high' | 'low'>('urgent')
  const [perPage, setPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const count = (k: 'all' | QuoteKind) => k === 'all' ? items.length : items.filter(i => i.kind === k).length

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const rows = items.filter(i => {
      if (tab !== 'all' && i.kind !== tab) return false
      if (term && !`${i.storeName} ${i.jobRef ?? ''} ${i.category ?? ''} ${i.description ?? ''}`.toLowerCase().includes(term)) return false
      return true
    })
    const cmp: Record<string, (a: SupplierQuoteItem, b: SupplierQuoteItem) => number> = {
      urgent: (a, b) => rankOf(a.priority) - rankOf(b.priority) || +new Date(b.at) - +new Date(a.at),
      newest: (a, b) => +new Date(b.at) - +new Date(a.at),
      oldest: (a, b) => +new Date(a.at) - +new Date(b.at),
      high: (a, b) => (b.amount ?? -1) - (a.amount ?? -1),
      low: (a, b) => (a.amount ?? Infinity) - (b.amount ?? Infinity),
    }
    return [...rows].sort(cmp[sort])
  }, [items, tab, q, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const curPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((curPage - 1) * perPage, curPage * perPage)
  const firstShown = filtered.length ? (curPage - 1) * perPage + 1 : 0
  const lastShown = Math.min(curPage * perPage, filtered.length)
  const reset = () => setPage(1)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]"><ReceiptText size={22} className="text-blue-600 dark:text-blue-400" /> Quotes</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">View and manage quote requests and the quotes you have submitted.</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-[var(--text-muted)]"><Info size={14} className="text-blue-600 dark:text-blue-400" /> All amounts are excl. VAT.</p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2">
        {([{ k: 'all' as const, label: 'All', tint: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', ring: 'ring-blue-500/40' }, ...ORDER.map(k => ({ k, label: STATUS[k].label, tint: STATUS[k].tab, ring: STATUS[k].ring }))]).map(t => {
          const active = tab === t.k
          return (
            <button key={t.k} onClick={() => { setTab(t.k); reset() }} aria-pressed={active}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition ${t.k === 'all' ? '' : 'min-w-[172px] justify-center'} ${t.tint} ${t.ring} ${active ? 'font-bold ring-2' : 'font-semibold ring-1 opacity-80 hover:opacity-100'}`}>
              {t.label} <span className="rounded-md bg-black/10 px-1.5 py-0.5 text-xs tabular-nums dark:bg-white/10">{count(t.k)}</span>
            </button>
          )
        })}
      </div>

      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
            <input value={q} onChange={e => { setQ(e.target.value); reset() }} placeholder="Search by store, ticket or quote ID…"
              className="w-full rounded-xl bg-[var(--input-bg)] py-2 pl-9 pr-3 text-sm text-[var(--text)] ring-1 ring-[var(--border)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
          </div>
          <div className="relative">
            <ChevronDown size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
            <select aria-label="Sort" value={sort} onChange={e => { setSort(e.target.value as typeof sort); reset() }} className={SEL}>
              <option value="urgent">Most urgent first</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="high">Amount: high</option><option value="low">Amount: low</option>
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
              <th className="px-4 py-2.5 font-medium">Store / Ticket</th><th className="px-3 font-medium">Request / Submitted</th><th className="px-3 font-medium">Proposed visit</th><th className="px-3 font-medium">Valid until</th><th className="px-3 font-medium">Amount (excl. VAT)</th><th className="px-3 font-medium">Status</th><th className="px-3"></th>
            </tr></thead>
            <tbody>
              {pageRows.map(i => (
                <tr key={i.key} onClick={() => router.push(`/supplier/tickets/${i.ticketId}`)} className="group cursor-pointer border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--hover)]">
                  <td className="px-4 py-3">
                    <Link href={`/supplier/tickets/${i.ticketId}`} className="flex items-center gap-3">
                      <CategoryIcon category={i.category ?? i.storeName} priority={i.priority} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[var(--text)]">{i.storeName}</span>
                        <span className="block truncate text-[11px] text-[var(--text-faint)]">{[i.jobRef, i.category].filter(Boolean).join(' · ')}</span>
                        {i.description && <span className="block max-w-[280px] truncate text-[11px] text-[var(--text-muted)]">{i.description}</span>}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3"><p className="text-[11px] text-[var(--text-faint)]">{i.kind === 'requested' ? 'Requested' : 'Submitted'}</p><p className="flex items-center gap-1.5 text-[var(--text)]"><Calendar size={13} className="text-[var(--text-faint)]" /> {formatDateTime(i.at)}</p></td>
                  <td className="px-3 text-[var(--text)]">{i.proposedVisit ? <span className="flex items-center gap-1.5"><Calendar size={13} className="text-[var(--text-faint)]" /> {formatDateTime(i.proposedVisit)}</span> : <span className="text-[var(--text-faint)]">–</span>}</td>
                  <td className="px-3 text-[var(--text)]">{i.validUntil ? <span className="flex items-center gap-1.5"><Calendar size={13} className="text-[var(--text-faint)]" /> {formatDate(i.validUntil)}</span> : <span className="text-[var(--text-faint)]">–</span>}</td>
                  <td className="px-3">{i.amount != null ? <><span className="block font-semibold tabular-nums text-[var(--text)]">{formatCurrency(i.amount)}</span>{i.amountInclVat != null && <span className="block text-[11px] text-[var(--text-faint)]">{formatCurrency(i.amountInclVat)} incl VAT</span>}</> : <span className="text-[var(--text-faint)]">–</span>}</td>
                  <td className="px-3">
                    <div className="flex w-fit flex-col items-stretch gap-1">
                      {PRIO[i.priority] && <span className={`${BADGE} ${PRIO[i.priority].cls}`}>{PRIO[i.priority].label}</span>}
                      <span className={`${BADGE} ${STATUS[i.kind].badge}`}>{i.declinedLabel ?? STATUS[i.kind].label}</span>
                      {i.kind === 'declined' && i.reQuoteRequested && <span className={`${BADGE} bg-amber-500/15 text-amber-700 dark:text-amber-400`}>Re-quote requested</span>}
                    </div>
                  </td>
                  <td className="px-3 text-right"><Link href={`/supplier/tickets/${i.ticketId}`} aria-label="Open ticket" className="inline-flex rounded-lg p-1.5 text-[var(--text-faint)] transition group-hover:text-[var(--text)]"><Chev size={16} /></Link></td>
                </tr>
              ))}
              {!pageRows.length && <tr><td colSpan={7} className="py-10 text-center text-[var(--text-faint)]">{items.length ? 'No quotes match your filters.' : 'No quotes yet.'}</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Phone / tablet — stacked cards */}
        <ul className="divide-y divide-[var(--border)] lg:hidden">
          {pageRows.map(i => (
            <li key={i.key}>
              <Link href={`/supplier/tickets/${i.ticketId}`} className="block p-3 transition hover:bg-[var(--hover)]">
                <div className="flex items-start gap-3">
                  <CategoryIcon category={i.category ?? i.storeName} priority={i.priority} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">{i.storeName}</p>
                      <span className="flex w-fit shrink-0 flex-col items-stretch gap-1">
                        {PRIO[i.priority] && <span className={`${BADGE} ${PRIO[i.priority].cls}`}>{PRIO[i.priority].label}</span>}
                        <span className={`${BADGE} ${STATUS[i.kind].badge}`}>{i.declinedLabel ?? STATUS[i.kind].label}</span>
                        {i.kind === 'declined' && i.reQuoteRequested && <span className={`${BADGE} bg-amber-500/15 text-amber-700 dark:text-amber-400`}>Re-quote requested</span>}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-[var(--text-faint)]">{[i.jobRef, i.category].filter(Boolean).join(' · ')}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                      <span>{i.kind === 'requested' ? 'Requested' : 'Submitted'} {formatDateTime(i.at)}</span>
                      {i.amount != null && <span className="font-semibold text-[var(--text)]">{formatCurrency(i.amount)}</span>}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
          {!pageRows.length && <li className="py-10 text-center text-sm text-[var(--text-faint)]">{items.length ? 'No quotes match your filters.' : 'No quotes yet.'}</li>}
        </ul>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] p-3">
          <span className="text-sm text-[var(--text-muted)] tabular-nums">Showing {firstShown} to {lastShown} of {filtered.length} quotes</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={curPage <= 1} aria-label="Previous page" className="rounded-lg p-1.5 text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-40"><ChevronLeft size={15} /></button>
              <span className="px-1 text-xs text-[var(--text-muted)] tabular-nums">Page {curPage} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={curPage >= totalPages} aria-label="Next page" className="rounded-lg p-1.5 text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-40"><ChevronRight size={15} /></button>
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">Rows per page
              <div className="relative"><select value={String(perPage)} onChange={e => { setPerPage(Number(e.target.value)); reset() }} className="appearance-none rounded-xl bg-[var(--input-bg)] py-1.5 pl-3 pr-7 text-sm text-[var(--text)] ring-1 ring-[var(--border)]"><option value="10">10</option><option value="25">25</option><option value="50">50</option></select><ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" /></div>
            </label>
          </div>
        </div>
      </Card>
    </div>
  )
}
