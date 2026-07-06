export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ReceiptText, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { redirect } from 'next/navigation'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { PersistentDetails } from '@/components/ui/PersistentDetails'
import { formatCurrency, formatDateTime } from '@/lib/utils'

// Pill (badge) classes per quote state — incl. the synthetic "requested".
const STATUS_BADGE: Record<string, string> = {
  requested: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
  pending: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D]',
  accepted: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  declined: 'bg-red-500/15 text-red-700 dark:text-red-400',
  revision_requested: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
}
const STATUS_LABEL: Record<string, string> = { requested: 'Quote requested', pending: 'Pending', accepted: 'Approved', declined: 'Declined', revision_requested: 'Revision requested' }
// Uniform badge size so the VAT + status pills line up.
const BADGE = 'inline-flex items-center justify-center w-full text-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide'

const FILTERS: { key: string; label: string; active: string; inactive: string }[] = [
  { key: 'all', label: 'All', active: 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-[#0a0e17] dark:border-white', inactive: 'text-[var(--text-muted)] border-[var(--border)] hover:border-slate-400' },
  { key: 'requested', label: 'Quote requested', active: 'bg-cyan-500 text-white border-cyan-500', inactive: 'text-cyan-600 dark:text-cyan-400 border-cyan-500/40 hover:border-cyan-400' },
  { key: 'pending', label: 'Pending', active: 'bg-[#C6A35D] text-[#0a0e17] border-[#C6A35D]', inactive: 'text-amber-600 dark:text-[#C6A35D] border-[#C6A35D]/40 hover:border-[#C6A35D]' },
  { key: 'accepted', label: 'Approved', active: 'bg-emerald-500 text-white border-emerald-500', inactive: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 hover:border-emerald-400' },
  { key: 'declined', label: 'Declined', active: 'bg-red-500 text-white border-red-500', inactive: 'text-red-600 dark:text-red-400 border-red-500/40 hover:border-red-400' },
]
// Submitted quotes whose ticket is past the quoting/decision phase belong in Sign-off /
// archive, not here — EXCEPT declined ones, which the supplier should still see.
const HIDE_FROM_QUOTES = new Set(['submitted_for_signoff', 'approved_closeout', 'evidence_requested', 'snag', 'snag_assigned', 'snag_in_progress', 'snag_resolved', 'pending_sign_off', 'completed'])
// Ticket statuses where this supplier still owes a quote.
const AWAITING_QUOTE = new Set(['assigned', 'assessment', 'quote_requested', 'quote_revision'])

interface QItem {
  key: string; ticketId: string; ticketTitle: string; storeName: string; branchCode: string | null
  createdAt: string; amount: number | null; status: string; byYou?: boolean; byClient?: boolean
}

export default async function SupplierQuotesPage({ searchParams }: { searchParams?: { status?: string } }) {
  const { companyId, supplierIds } = await requireSupplierV3()
  if (!companyId) redirect('/supplier') // standalone self-signup supplier — see dashboard
  const d = await assembleSupplierDashboard(companyId, supplierIds)
  const active = FILTERS.some(f => f.key === searchParams?.status) ? searchParams!.status! : 'all'

  // Who declined each ticket for this supplier ('supplier' = they declined it).
  const declinedByByTicket = new Map(d.tickets.map(t => [t.id, t.declinedBy]))

  // Submitted quotes — declined ones always show; others hide once past the decision phase.
  const quoteItems: QItem[] = d.quotes
    .filter(q => q.status === 'declined' || !HIDE_FROM_QUOTES.has(q.ticketStatus))
    // A quote is only ever declined by the supplier (they declined the work) or by the
    // client/RM (declined the quote, incl. a soft decline that re-invites, or awarding
    // another supplier). So anything not declined-by-you is "Declined (Client)".
    .map(q => ({ key: `q-${q.id}`, ticketId: q.ticketId, ticketTitle: q.ticketTitle, storeName: q.storeName, branchCode: q.branchCode, createdAt: q.createdAt, amount: q.amount, status: q.status, byYou: q.status === 'declined' && declinedByByTicket.get(q.ticketId) === 'supplier', byClient: q.status === 'declined' && declinedByByTicket.get(q.ticketId) !== 'supplier' }))

  // Tickets where the RM requested a quote but this supplier hasn't submitted yet.
  const quotedTicketIds = new Set(d.quotes.map(q => q.ticketId))
  const requestedItems: QItem[] = d.tickets
    .filter(t => !t.declinedForMe && AWAITING_QUOTE.has(t.status) && !quotedTicketIds.has(t.id))
    .map(t => ({ key: `r-${t.id}`, ticketId: t.id, ticketTitle: t.title, storeName: t.storeName, branchCode: t.branchCode, createdAt: t.quoteRequestedAt ?? t.createdAt, amount: null, status: 'requested' }))

  // Tickets the supplier declined before quoting (no quote row) — shown as Declined
  // so the request still appears here. (RM-declined quotes already arrive via quoteItems.)
  const declinedRequestItems: QItem[] = d.tickets
    .filter(t => t.declinedForMe && !quotedTicketIds.has(t.id))
    .map(t => ({ key: `d-${t.id}`, ticketId: t.id, ticketTitle: t.title, storeName: t.storeName, branchCode: t.branchCode, createdAt: t.declinedAt ?? t.quoteRequestedAt ?? t.createdAt, amount: null, status: 'declined', byYou: t.declinedBy === 'supplier', byClient: t.declinedBy === 'regional_manager' }))

  const all = [...requestedItems, ...quoteItems, ...declinedRequestItems]
  const shown = active === 'all' ? all : all.filter(i => i.status === active)

  const byStore = new Map<string, QItem[]>()
  for (const i of shown) { const a = byStore.get(i.storeName) ?? []; a.push(i); byStore.set(i.storeName, a) }
  const groups = [...byStore.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  // Within a store: live quotes/requests first (newest → oldest), declined ones last.
  for (const [, items] of groups) items.sort((a, b) =>
    (Number(a.status === 'declined') - Number(b.status === 'declined')) || (+new Date(b.createdAt) - +new Date(a.createdAt)))

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><ReceiptText className="text-amber-600 dark:text-amber-500" size={22} /> Quotes</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Quote requests and the quotes you have submitted, grouped by store. Tap one to open its ticket. Amounts are excl VAT.</p></div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <Link key={f.key} href={f.key === 'all' ? '/supplier/quotes' : `/supplier/quotes?status=${f.key}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${active === f.key ? f.active : f.inactive}`}>
            {f.label}
          </Link>
        ))}
      </div>

      {!groups.length && (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
          <ReceiptText size={28} className="mx-auto text-[var(--text-faint)] mb-2" />
          <p className="text-sm text-[var(--text-faint)]">{all.length ? 'No quotes match this filter.' : 'No active quotes.'}</p>
        </div>
      )}

      {groups.map(([store, items]) => (
        <PersistentDetails key={store} persistKey={`supplier-quotes-${store}`} className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none hover:bg-[var(--hover)] transition">
            <Building2 size={16} className="text-[#C6A35D] shrink-0" />
            <span className="flex-1 min-w-0 text-sm font-bold text-[var(--text)] truncate">{[d.company, store].filter(Boolean).join(' · ')}{items[0].branchCode ? ` · ${items[0].branchCode}` : ''}</span>
            <span className="text-[11px] font-semibold text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5 shrink-0">{items.length} quote{items.length !== 1 ? 's' : ''}</span>
            <ChevronDown size={16} className="text-[var(--text-faint)] shrink-0 group-open:hidden" />
            <ChevronUp size={16} className="text-[var(--text-faint)] shrink-0 hidden group-open:block" />
          </summary>
          <div className="border-t border-[var(--border)]">
            {items.map(i => (
              <Link key={i.key} href={`/supplier/tickets/${i.ticketId}`} className="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text)] truncate">{i.ticketTitle}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">{i.status === 'requested' ? 'Requested' : 'Submitted'} · {formatDateTime(i.createdAt)}</p>
                </div>
                <div className="flex flex-col items-stretch gap-1 shrink-0 w-32">
                  <span className="text-sm font-semibold text-[var(--text)] tabular-nums whitespace-nowrap text-left">{i.amount != null ? formatCurrency(i.amount) : '—'}</span>
                  {i.amount != null && <span className={`${BADGE} bg-slate-500/15 text-slate-600 dark:text-slate-300`}>excl VAT</span>}
                  <span className={`${BADGE} ${STATUS_BADGE[i.status] ?? 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>{i.status === 'declined' ? (i.byYou ? 'Declined (you)' : i.byClient ? 'Declined (Client)' : 'Declined') : (STATUS_LABEL[i.status] ?? i.status.replace('_', ' '))}</span>
                </div>
              </Link>
            ))}
          </div>
        </PersistentDetails>
      ))}
    </div>
  )
}
