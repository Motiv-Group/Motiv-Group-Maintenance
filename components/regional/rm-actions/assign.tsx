'use client'

// Assign/dispatch actions: the searchable supplier picker, the Today-queue
// "View & Assign" pop-up, and the per-supplier status list.
import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ChevronDown, ChevronLeft, ChevronRight, Send } from 'lucide-react'
import { Stars } from '@/components/ui/Stars'
import { PhotoThumbs } from '@/components/ui/PhotoThumbs'
import { formatCurrency, formatDateTime, rmStatusMeta, PRIORITY_LEVEL_LABELS, OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'
import { Modal } from './modal'
import { post, PANEL_META, type SupplierChoice } from './shared'

// ── Assign suppliers (button → modal: searchable, sortable, paginated table) ─

// Up-to-3-letter monogram from the supplier name (avatar fallback).
function supInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.length ? parts.slice(0, 3).map(p => p[0]!.toUpperCase()).join('') : '?'
}

export function AssignSuppliersButton({ ticketId, suppliers, motivSuppliers = [], declinedSupplierIds = [], awaitingById = {}, trigger }: { ticketId: string; suppliers: SupplierChoice[]; motivSuppliers?: SupplierChoice[]; declinedSupplierIds?: string[]; awaitingById?: Record<string, 'invited' | 'quoted'>; trigger?: (open: () => void) => ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  // Auto-open when deep-linked from the Today queue's "Assign supplier" action
  // (?assign=1) — the new-ticket next step opens straight into the picker.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only deep-link (?assign=1) read from window.location after mount; cannot run during SSR render
    if (new URLSearchParams(window.location.search).get('assign') === '1') setOpen(true)
  }, [])
  const [tab, setTab] = useState<'mine' | 'motiv'>('mine')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'rating' | 'name'>('rating')
  const [page, setPage] = useState(1)
  const perPage = 10
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmReinvite, setConfirmReinvite] = useState(false)
  const declinedSet = useMemo(() => new Set(declinedSupplierIds), [declinedSupplierIds])
  const nameById = useMemo(() => new Map([...suppliers, ...motivSuppliers].map(s => [s.id, s.name])), [suppliers, motivSuppliers])
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); setConfirmReinvite(false); return n })

  // Selection spans both lists; the tab just switches which directory is shown.
  const activeList = tab === 'motiv' ? motivSuppliers : suppliers
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    const cmp = sort === 'name'
      ? (a: SupplierChoice, b: SupplierChoice) => a.name.localeCompare(b.name)
      : (a: SupplierChoice, b: SupplierChoice) => (b.avgRating ?? 5) - (a.avgRating ?? 5) || a.name.localeCompare(b.name)
    return [...activeList]
      .filter(s => !term || `${s.name} ${s.category ?? ''}`.toLowerCase().includes(term))
      // Selected rows float to the top so they stay visible across pages/sorts.
      .sort((a, b) => (sel.has(b.id) ? 1 : 0) - (sel.has(a.id) ? 1 : 0) || cmp(a, b))
  }, [activeList, q, sort, sel])
  const reselected = useMemo(() => [...sel].filter(id => declinedSet.has(id)), [sel, declinedSet])

  // Reset to page 1 whenever the visible set changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- keep pagination in range as tab/search/sort change
  useEffect(() => { setPage(1) }, [tab, q, sort])
  const totalPages = Math.max(1, Math.ceil(shown.length / perPage))
  const curPage = Math.min(page, totalPages)
  const pageRows = shown.slice((curPage - 1) * perPage, curPage * perPage)
  const firstShown = shown.length ? (curPage - 1) * perPage + 1 : 0
  const lastShown = Math.min(curPage * perPage, shown.length)

  async function doAssign() {
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/assign`, { supplierIds: [...sel] }); setOpen(false); setBusy(false); setConfirmReinvite(false); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }
  function assign() {
    if (!sel.size) { setErr('Select at least one supplier.'); return }
    // A supplier that previously declined this ticket → warn before re-sending.
    if (reselected.length && !confirmReinvite) { setConfirmReinvite(true); setErr(''); return }
    doAssign()
  }

  const tabCls = (on: boolean) => `flex-1 min-w-0 truncate px-1 py-2 rounded-lg text-sm font-semibold transition ${on ? 'bg-emerald-600 text-white' : 'ring-1 ring-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]'}`
  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (
        <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition">Assign supplier</button>
      )}
      {open && (
        <Modal title="Assign suppliers" maxWidth="max-w-3xl" onClose={() => { if (!busy) setOpen(false) }}>
          <p className="-mt-1 text-sm text-[var(--text-muted)]">Select one or more suppliers to send a quote request for this ticket.</p>

          {/* Directory tabs — selection carries across both. */}
          <div className="flex gap-2">
            <button onClick={() => setTab('mine')} className={tabCls(tab === 'mine')}>My suppliers ({suppliers.length})</button>
            <button onClick={() => setTab('motiv')} className={tabCls(tab === 'motiv')}>MOTIV directory ({motivSuppliers.length})</button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or category…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
          </div>

          {/* Count + sort */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--text-muted)]">{shown.length} supplier{shown.length === 1 ? '' : 's'} found</span>
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              Sort by
              <div className="relative">
                <select value={sort} onChange={e => setSort(e.target.value as 'rating' | 'name')} className="appearance-none rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-xs pl-2.5 pr-7 py-1.5 cursor-pointer focus:outline-none">
                  <option value="rating">Rating</option><option value="name">Name</option>
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
              </div>
            </label>
          </div>

          {/* Supplier rows */}
          <div className="min-h-[220px] divide-y divide-[var(--border)] rounded-xl ring-1 ring-[var(--border)]">
            {pageRows.map(s => {
              // Already invited / already quoted on this ticket → not selectable.
              const awaiting = awaitingById[s.id]
              if (awaiting) {
                return (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 opacity-60">
                    <span className="w-4 shrink-0" aria-hidden />
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[11px] font-bold text-[var(--text-muted)]">{supInitials(s.name)}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm text-[var(--text-muted)]">{s.name}</span>{s.category && <span className="block truncate text-[11px] text-[var(--text-faint)]">{s.category}</span>}</span>
                    <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">{awaiting === 'quoted' ? 'Quoted' : 'Awaiting quote'}</span>
                  </div>
                )
              }
              const on = sel.has(s.id)
              return (
                <label key={s.id} className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition ${on ? 'bg-emerald-500/10' : 'hover:bg-[var(--hover)]'}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(s.id)} className="h-4 w-4 shrink-0 accent-emerald-600" />
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-600/15 text-[11px] font-bold text-blue-700 dark:text-blue-300">{supInitials(s.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--text)]">{s.name}{declinedSet.has(s.id) && <span className="ml-1.5 text-[10px] font-semibold text-red-500">· declined before</span>}</span>
                    {s.category && <span className="block truncate text-[11px] text-[var(--text-muted)]">{s.category}</span>}
                  </span>
                  {/* Full star row is sm+; phones get a compact rating so the supplier
                      name keeps its space. */}
                  <span className="hidden shrink-0 sm:block"><Stars value={s.avgRating ?? 5} count={s.ratingCount} size={13} /></span>
                  <span className="shrink-0 text-[11px] font-semibold text-amber-500 sm:hidden">{(s.avgRating ?? 5).toFixed(1)}★</span>
                </label>
              )
            })}
            {!pageRows.length && <p className="px-3 py-10 text-center text-sm text-[var(--text-faint)]">{tab === 'motiv' ? 'No MOTIV directory suppliers available.' : 'No matching suppliers.'}</p>}
          </div>

          {/* Pagination */}
          {shown.length > perPage && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-[var(--text-faint)] tabular-nums">{firstShown}–{lastShown} of {shown.length}</span>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={curPage <= 1} aria-label="Previous page" className="rounded-lg p-1.5 text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-40"><ChevronLeft size={15} /></button>
                <span className="text-xs text-[var(--text-muted)] tabular-nums px-1">Page {curPage} / {totalPages}</span>
                <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={curPage >= totalPages} aria-label="Next page" className="rounded-lg p-1.5 text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-40"><ChevronRight size={15} /></button>
              </div>
            </div>
          )}

          {confirmReinvite && (
            <div className="rounded-lg bg-amber-500/10 ring-1 ring-amber-500/40 p-3">
              <p className="text-sm text-[var(--text)]"><span className="font-semibold">{reselected.map(id => nameById.get(id) ?? 'Supplier').join(', ')}</span> declined the previous quote request for this ticket. Send it to them again?</p>
            </div>
          )}
          {err && <p className="text-xs text-red-500">{err}</p>}

          {/* Footer — selection summary + actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
            <p className="flex items-center gap-2 text-sm">
              <span className={`grid h-6 w-6 place-items-center rounded-full ${sel.size ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-[var(--surface-2)] text-[var(--text-faint)]'}`}><Send size={13} /></span>
              <span className="text-[var(--text-muted)]">{sel.size ? <><span className="font-semibold text-[var(--text)]">{sel.size} selected</span> · they&apos;ll be notified to quote</> : 'No suppliers selected'}</span>
            </p>
            {/* Buttons stack on phones (the pair needs ~300px side by side). */}
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
              <button onClick={() => { confirmReinvite ? setConfirmReinvite(false) : setOpen(false) }} disabled={busy} className="rounded-xl px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-50">{confirmReinvite ? 'Back' : 'Cancel'}</button>
              <button disabled={busy || !sel.size} onClick={assign} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
                <Send size={15} /> {busy ? 'Sending…' : confirmReinvite ? 'Yes, send again' : `Send quote request${sel.size ? ` (${sel.size})` : ''}`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── View & Assign (Today queue) ─────────────────────────────────
// A pop-up that shows the ticket detail + the quotes gathered so far, with the
// assign-supplier action in place. Replaces the bare supplier-picker CTA so the
// RM can review the job (description, photos, impact, any quotes) before requesting
// quotes. Ticket detail + quote rows are fetched on open from the RM-only /quotes
// endpoint; the header renders instantly from the queue row's summary.
interface ViewAssignSummary { category: string | null; title: string; storeName: string; status: string; priority: string; jobId: string | null }
interface ViewAssignTicket { title: string; category: string | null; description: string; operationalImpact: string | null; priority: string | null; jobRef: string | null; storeName: string | null; photoUrls: string[] }
interface ViewAssignQuoteRow { supplierId: string; name: string; kind: 'waiting' | 'received' | 'accepted' | 'declined'; quote: { amount: number } | null }

// Priority pill colours (mirrors the Today queue's priorityBadgeClass).
function vaPriorityBadge(p: string): string {
  if (p === 'urgent' || p === 'P1') return 'bg-red-500/15 text-red-600 dark:text-red-400'
  if (p === 'high' || p === 'P2') return 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
  if (p === 'medium' || p === 'P3') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  return 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
}

export function ViewAssignButton({ ticketId, summary, suppliers, motivSuppliers = [], awaitingById = {}, declinedSupplierIds = [], trigger }: {
  ticketId: string; summary: ViewAssignSummary
  suppliers: SupplierChoice[]; motivSuppliers?: SupplierChoice[]
  awaitingById?: Record<string, 'invited' | 'quoted'>; declinedSupplierIds?: string[]
  trigger: (open: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [ticket, setTicket] = useState<ViewAssignTicket | null>(null)
  const [rows, setRows] = useState<ViewAssignQuoteRow[]>([])

  useEffect(() => {
    if (!open) return
    let live = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets fetch state when the pop-up opens, before the async load; cannot run during render
    setLoading(true); setErr('')
    fetch(`/api/tickets/${ticketId}/quotes`)
      .then(r => r.json())
      .then(d => { if (!live) return; if (d?.error) setErr(d.error); else { setTicket(d.ticket ?? null); setRows(d.rows ?? []) } })
      .catch(() => { if (live) setErr('Could not load the ticket.') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [open, ticketId])

  const meta = rmStatusMeta(summary.status)
  const priorityLabel = PRIORITY_LEVEL_LABELS[String(summary.priority)] ?? 'Medium'

  return (
    <>
      {trigger(() => setOpen(true))}
      {open && (
        <Modal title="Ticket &amp; quotes" maxWidth="max-w-2xl" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            {/* Ticket detail header (renders instantly from the queue row). */}
            <div className="min-w-0">
              {summary.jobId && <p className="font-mono text-[10px] text-[var(--text-faint)]">{summary.jobId}</p>}
              <p className="text-base font-bold text-[var(--text)]">{summary.category || summary.title}</p>
              <p className="text-sm text-[var(--text-muted)]">{summary.storeName}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex justify-center rounded-md px-2 py-1 text-[10px] font-bold ${vaPriorityBadge(String(summary.priority))}`}>{priorityLabel}</span>
              <span className={`inline-flex justify-center rounded-md px-2 py-1 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
            </div>

            {loading ? <p className="py-4 text-center text-sm text-[var(--text-faint)]">Loading…</p>
              : err ? <p className="text-sm text-red-500">{err}</p>
              : ticket && (
                <>
                  {ticket.description && <p className="whitespace-pre-line break-words text-sm text-[var(--text-muted)]">{ticket.description}</p>}
                  {ticket.operationalImpact && <p className="text-xs text-[var(--text-faint)]">Impact · {OPERATIONAL_IMPACT_LABELS[ticket.operationalImpact] ?? ticket.operationalImpact}</p>}
                  {ticket.photoUrls.length > 0 && <PhotoThumbs urls={ticket.photoUrls} ticketId={ticketId} limit={5} />}

                  {/* Suppliers & quotes gathered so far. */}
                  <div className="space-y-1 rounded-xl ring-1 ring-[var(--border)] p-3">
                    <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Suppliers &amp; quotes</p>
                    {rows.length ? rows.map(r => {
                      const m = PANEL_META[r.kind]
                      return (
                        <div key={r.supplierId} className="flex items-center justify-between gap-2 py-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <i className={`h-2.5 w-2.5 shrink-0 rounded-full ${m.dot}`} />
                            <span className="truncate text-sm text-[var(--text)]">{r.name}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {r.quote && <span className="text-sm font-semibold text-[var(--text)]">{formatCurrency(r.quote.amount)}</span>}
                            <span className={`text-[11px] font-semibold ${m.txt}`}>{m.label}</span>
                          </span>
                        </div>
                      )
                    }) : <p className="py-2 text-center text-sm text-[var(--text-faint)]">No suppliers requested yet.</p>}
                  </div>
                </>
              )}

            {/* Assign action — opens the existing searchable supplier picker on top. */}
            <div className="border-t border-[var(--border)] pt-3">
              <AssignSuppliersButton ticketId={ticketId} suppliers={suppliers} motivSuppliers={motivSuppliers} awaitingById={awaitingById} declinedSupplierIds={declinedSupplierIds}
                trigger={openPicker => <button onClick={openPicker} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">Assign supplier</button>} />
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Per-supplier status indicators (with request-sent time) ─────
const TS_META: Record<string, { dot: string; label: string; txt: string }> = {
  invited:  { dot: 'bg-amber-500',   label: 'Waiting for quote', txt: 'text-amber-700 dark:text-amber-400' },
  quoted:   { dot: 'bg-emerald-500', label: 'Quote received',    txt: 'text-emerald-700 dark:text-emerald-400' },
  awarded:  { dot: 'bg-emerald-600', label: 'Awarded',           txt: 'text-emerald-700 dark:text-emerald-400' },
  declined: { dot: 'bg-red-500',     label: 'Declined',          txt: 'text-red-600 dark:text-red-400' },
  closed:   { dot: 'bg-gray-400',    label: 'Closed',            txt: 'text-[var(--text-faint)]' },
}
export function SupplierStatusList({ rows }: { rows: { name: string; status: string; invitedAt?: string | null; declineReason?: string | null }[] }) {
  if (!rows.length) return null
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        // A still-invited supplier that carries a decline reason was soft-declined
        // and asked to re-quote → "Awaiting updated quote" rather than "Waiting".
        const m = (r.status === 'invited' && r.declineReason)
          ? { dot: 'bg-amber-500', label: 'Awaiting updated quote', txt: 'text-amber-700 dark:text-amber-400' }
          : (TS_META[r.status] ?? TS_META.invited)
        return (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm text-[var(--text)] min-w-0">
                <i className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.dot}`} />
                <span className="truncate">{r.name}</span>
                {r.invitedAt && <span className="text-[11px] text-[var(--text-faint)] shrink-0 hidden sm:inline">· requested {formatDateTime(r.invitedAt)}</span>}
              </span>
              <span className={`text-[11px] font-semibold shrink-0 ${m.txt}`}>{m.label}</span>
            </div>
            {r.status === 'declined' && r.declineReason && (
              <div className="ml-[18px] rounded-lg bg-red-500/10 ring-1 ring-red-500/30 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Reason for declining</p>
                <p className="text-sm text-[var(--text)]">{r.declineReason}</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
