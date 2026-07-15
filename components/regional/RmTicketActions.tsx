'use client'

// RM ticket-page custom actions for the competitive-quoting model.
import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useScrollLock } from '@/lib/useScrollLock'
import { Search, Pencil, CalendarClock, Plus, Camera, Info, X, FileText, ChevronDown, ChevronLeft, ChevronRight, MessageSquare, XCircle, Send, AlertCircle, Trash2, Store, ShieldCheck, Clock, Calendar, ClipboardCheck, Image as ImageIcon, CheckCircle2, AlertTriangle } from 'lucide-react'
import { StarInput, Stars } from '@/components/ui/Stars'
import { PhotoThumbs } from '@/components/ui/PhotoThumbs'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { QuoteSummary } from '@/components/workflow/QuoteSummary'
import { uploadFiles } from '@/lib/upload'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'

async function post(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Something went wrong')
}

function Modal({ title, onClose, children, maxWidth = 'max-w-md' }: { title: ReactNode; onClose: () => void; children: React.ReactNode; maxWidth?: string }) {
  useScrollLock() // lock the background so it can't scroll behind the pop-up
  return (
    // Bottom-sheet on phones (mirrors components/ui/Modal), centered from sm up.
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className={`bg-[var(--surface-2)] ring-1 ring-[var(--border)] rounded-t-2xl p-4 sm:rounded-2xl sm:p-5 ${maxWidth} w-full space-y-3 max-h-[92vh] sm:max-h-[85vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-base font-bold text-[var(--text)]">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 -m-1 rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── "More" dropdown — a compact button (sits next to the primary action) that
// drops a floating menu of secondary/destructive actions. It ONLY renders the menu
// buttons; the actual modals live as siblings in RmTicketActionBar driven by lifted
// state, so opening one is instant and doesn't depend on the menu staying mounted.
export function MoreMenu({ children, fullWidth = false, label = 'More', up = false, align = 'right' }: { children: ReactNode; fullWidth?: boolean; label?: string; up?: boolean; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  // The menu is PORTALLED to <body> and fixed-positioned against the trigger, so
  // it's never clipped by a pop-up's `overflow-y-auto` body (which also clips
  // overflow-x, cutting the old absolute menu off to the side). Left is clamped
  // into the viewport so a 256px menu can't run off a phone edge. Scroll/resize
  // just closes it — simpler and correct vs. live repositioning.
  useEffect(() => {
    if (!open) return
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect()
      if (!b) return
      const width = Math.min(256, window.innerWidth - 16)
      let left = align === 'left' ? b.left : b.right - width
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      setPos({ top: up ? b.top - 8 : b.bottom + 8, left, width })
    }
    place()
    const onMove = () => setOpen(false)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => { window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove) }
  }, [open, align, up])

  return (
    <div className={`relative ${fullWidth ? '' : 'shrink-0'}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`${fullWidth ? 'w-full justify-center' : ''} flex items-center gap-1.5 py-2.5 px-4 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm font-semibold hover:bg-[var(--hover)] transition`}
      >
        {label} <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && pos && createPortal(
        <>
          {/* Outside-click catcher (below the menu, above everything else). */}
          <button aria-hidden tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-[110] cursor-default" />
          <div
            role="menu"
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, transform: up ? 'translateY(-100%)' : undefined }}
            className="z-[111] rounded-xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] shadow-lg shadow-black/20 p-1.5 space-y-0.5"
          >
            {children}
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}

type ActionKey = 'addwork' | 'info' | 'edit' | 'cancel'

// The RM Next-action cluster: one primary button (Assign supplier) + a "More"
// dropdown holding the secondary/destructive actions (add extra work, request info,
// edit, cancel). The dropdown items just set which modal is active; the modals are
// rendered as SIBLINGS (mounted only when active) so they open instantly — the
// previous approach kept them inside the collapsing menu, which felt laggy/buggy.
// Client component (a Server Component may not pass the click handlers).
export function RmTicketActionBar({ ticketId, status, canAssign, canAssignSupplier, canCancel, canEdit, jobRef, suppliers, motivSuppliers, declinedSupplierIds, awaitingById, description, photoUrls, title, category, impact, priority }: {
  ticketId: string
  status: string
  canAssign: boolean
  canAssignSupplier: boolean
  canCancel: boolean
  canEdit: boolean
  jobRef?: string | null
  suppliers: SupplierChoice[]
  motivSuppliers: SupplierChoice[]
  declinedSupplierIds: string[]
  awaitingById: Record<string, 'invited' | 'quoted'>
  description: string
  photoUrls: string[]
  title: string
  category: string
  impact: string
  priority: string
}) {
  const [active, setActive] = useState<ActionKey | null>(null)
  const done = () => setActive(null)
  const showRequestInfo = ['open', 'info_requested'].includes(status)
  const hasPrimary = canAssignSupplier
  const hasMenu = canAssign || showRequestInfo || canEdit || canCancel
  const primaryCls = `${hasMenu ? 'flex-1' : 'w-full'} py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition`
  // Once one or more suppliers have already been invited/quoted, assigning is
  // adding ANOTHER supplier — reflect that in the button label.
  const assignLabel = Object.keys(awaitingById).length > 0 ? 'Request another supplier' : 'Assign supplier'
  return (
    <>
      <div className={`flex items-center gap-2 ${hasPrimary && hasMenu ? '' : 'flex-col'}`}>
        {hasPrimary && (
          <AssignSuppliersButton ticketId={ticketId} suppliers={suppliers} motivSuppliers={motivSuppliers} declinedSupplierIds={declinedSupplierIds} awaitingById={awaitingById}
            trigger={open => <button onClick={open} className={primaryCls}>{assignLabel}</button>} />
        )}
        {hasMenu && (
          <MoreMenu fullWidth={!hasPrimary}>
            {canAssign && <MoreActionItem icon={<Plus size={16} />} label="Add extra work" onClick={() => setActive('addwork')} />}
            {showRequestInfo && <MoreActionItem icon={<MessageSquare size={16} />} label="Request more info" onClick={() => setActive('info')} />}
            {canEdit && <MoreActionItem icon={<Pencil size={16} />} label="Edit ticket" onClick={() => setActive('edit')} />}
            {canCancel && <MoreActionItem icon={<XCircle size={16} />} label="Cancel ticket" tone="danger" onClick={() => setActive('cancel')} />}
          </MoreMenu>
        )}
      </div>

      {/* Action modals — mounted only while active, so they appear instantly. */}
      {active === 'addwork' && <RmAddWorkForm defaultOpen onClose={done} ticketId={ticketId} description={description} photoUrls={photoUrls} title={title} category={category} impact={impact} />}
      {active === 'info' && <RequestInfoButton defaultOpen onClose={done} ticketId={ticketId} />}
      {active === 'edit' && <RmEditTicketForm defaultOpen onClose={done} ticketId={ticketId} initial={{ title, category, impact, priority, description }} />}
      {active === 'cancel' && <CancelTicketCard defaultOpen onClose={done} ticketId={ticketId} jobRef={jobRef} />}
    </>
  )
}

/** A single row inside the <MoreMenu> dropdown — icon + label, tinted red for
 *  destructive actions. Borderless menu-row styling. */
export function MoreActionItem({ icon, label, onClick, tone = 'default' }: { icon?: ReactNode; label: string; onClick: () => void; tone?: 'default' | 'danger' }) {
  const toneCls = tone === 'danger'
    ? 'text-red-600 dark:text-red-400 hover:bg-red-500/10'
    : 'text-[var(--text)] hover:bg-[var(--hover)]'
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition ${toneCls}`}>
      {icon && <span className={`shrink-0 ${tone === 'danger' ? '' : 'text-[var(--text-muted)]'}`}>{icon}</span>}
      {label}
    </button>
  )
}

// ── Assign suppliers (button → modal: searchable, sortable, paginated table) ─
type SupplierChoice = { id: string; name: string; avgRating?: number; ratingCount?: number; category?: string | null }

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

// ── Request more info (amber button → modal) ────────────────────
// Reason quick-pick + free-text message are BOTH optional — if the RM sends
// nothing specific, a neutral "please review" note goes to the store manager.
const INFO_REASONS = ['Need more detail', 'Photos unclear', 'Scope unclear', 'Access details needed']

const MAX_INFO_MSG = 1000
export function RequestInfoButton({ ticketId, defaultOpen = false, onClose, trigger }: { ticketId: string; defaultOpen?: boolean; onClose?: () => void; trigger?: (open: () => void) => ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [preset, setPreset] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const close = () => { setOpen(false); onClose?.() }

  async function submit() {
    // Nothing required — build the note from whatever was given, else a default.
    const reason = [preset, message.trim()].filter(Boolean).join(' — ') || 'Please review the ticket and add any missing detail.'
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'request_info', reason }); setPreset(''); setMessage(''); close(); setBusy(false); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)]'
  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (!defaultOpen &&
        <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition">Request more info</button>
      )}
      {open && (
        <Modal maxWidth="max-w-lg" title="Request more information" onClose={() => { if (!busy) close() }}>
          <p className="-mt-1 text-sm text-[var(--text-muted)]">The store manager will see this message and can respond.</p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">What do you need more information about? <span className="font-normal text-[var(--text-faint)]">(optional)</span></label>
            <select autoFocus className={input} value={preset} onChange={e => setPreset(e.target.value)}>
              <option value="">Select a reason</option>
              {INFO_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Your message to the store manager <span className="font-normal text-[var(--text-faint)]">(optional)</span></label>
            <div className="relative">
              <textarea maxLength={MAX_INFO_MSG} className={`${input} min-h-[110px] pb-7`} placeholder="Type your message…" value={message} onChange={e => setMessage(e.target.value.slice(0, MAX_INFO_MSG))} />
              <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] tabular-nums text-[var(--text-faint)]">{message.length} / {MAX_INFO_MSG}</span>
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/25 px-3.5 py-3">
            <Info size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">What happens next?</p>
              <p className="text-sm text-[var(--text-muted)]">The store manager is notified of your request. Once they respond, you can continue with the ticket.</p>
            </div>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={close} disabled={busy} className="flex-1 py-2.5 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm font-medium disabled:opacity-50">Cancel</button>
            <button disabled={busy} onClick={submit} className="flex flex-1 items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50"><Send size={15} /> {busy ? 'Sending…' : 'Send request'}</button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Request more evidence (amber button → modal) ────────────────
// Sends the COC/POC back asking for missing evidence, then the supplier resubmits.
// "Before photos missing" is intentionally NOT a reason here.
const EVIDENCE_REASONS = ['After photos missing', 'COC missing', 'Photos unclear', 'Work not fully shown', 'Other']

export function RequestEvidenceButton({ ticketId, defaultOpen = false, onClose, trigger }: { ticketId: string; defaultOpen?: boolean; onClose?: () => void; trigger?: (open: () => void) => ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [preset, setPreset] = useState('')
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const close = () => { setOpen(false); onClose?.() }

  async function submit() {
    if (!preset) { setErr('Choose what evidence is needed.'); return }
    const reason = preset === 'Other' ? other.trim() : preset
    if (!reason) { setErr('Tell the supplier what evidence you need.'); return }
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'request_evidence', reason }); setPreset(''); setOther(''); setBusy(false); close(); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'
  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (!defaultOpen &&
        <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-[#0a0e17] text-sm font-semibold transition">Request more evidence</button>
      )}
      {open && (
        <Modal title="Request more evidence" onClose={close}>
          <p className="text-xs text-[var(--text-muted)]">The supplier is asked to add the missing evidence and resubmit the COC &amp; POC.</p>
          <select autoFocus className={input} value={preset} onChange={e => setPreset(e.target.value)}>
            <option value="">— Choose what&apos;s needed —</option>
            {EVIDENCE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {preset === 'Other' && <textarea className={`${input} min-h-[80px]`} placeholder="What evidence do you need?" value={other} onChange={e => setOther(e.target.value)} />}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={submit} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Sending…' : 'Send request'}</button>
            <button onClick={close} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Raise snag (red button → modal, mirrors Request more info) ───
const SNAG_REASONS = ['Work incomplete', 'Quality below standard', 'Wrong materials or spec', 'Safety concern', 'Other']

export function RaiseSnagButton({ ticketId, defaultOpen = false, onClose, trigger }: { ticketId: string; defaultOpen?: boolean; onClose?: () => void; trigger?: (open: () => void) => ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [preset, setPreset] = useState('')
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const close = () => { setOpen(false); onClose?.() }

  async function submit() {
    if (!preset) { setErr('Choose the snag reason.'); return }
    const description = preset === 'Other' ? other.trim() : preset
    if (!description) { setErr('Describe the snag.'); return }
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'raise_snag', description }); setPreset(''); setOther(''); setBusy(false); close(); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'
  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (!defaultOpen &&
        <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition">Raise snag</button>
      )}
      {open && (
        <Modal title="Raise a snag" onClose={close}>
          <p className="text-xs text-[var(--text-muted)]">The completion is sent back. The supplier accepts the snag, schedules the corrective work and resubmits.</p>
          <select autoFocus className={input} value={preset} onChange={e => setPreset(e.target.value)}>
            <option value="">— Choose a reason —</option>
            {SNAG_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {preset === 'Other' && <textarea className={`${input} min-h-[80px]`} placeholder="Describe the snag…" value={other} onChange={e => setOther(e.target.value)} />}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={submit} className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Raising…' : 'Raise snag'}</button>
            <button onClick={close} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── RM edit ticket (before a supplier is assigned) ──────────────
const CATEGORIES = ['Electrical', 'Plumbing', 'HVAC', 'Refrigeration', 'Gas', 'Structural', 'General', 'Cleaning', 'Other']
const IMPACTS = [
  { v: 'none', label: 'No operational impact' }, { v: 'cosmetic', label: 'Cosmetic / minor' },
  { v: 'customer_visible', label: 'Customer-visible' }, { v: 'staff_inconvenience', label: 'Staff inconvenience' },
  { v: 'trading_affected', label: 'Trading affected' }, { v: 'safety_risk', label: 'Safety risk' }, { v: 'cannot_trade', label: 'Store cannot trade' },
]
const PRIORITIES = [{ v: 'P1', label: 'Urgent' }, { v: 'P2', label: 'High' }, { v: 'P3', label: 'Medium' }, { v: 'P4', label: 'Low' }]

const MAX_EDIT_DESC = 2000
function ReqLabel({ label, children }: { label: string; children: ReactNode }) {
  return <div><label className="mb-1.5 block text-sm font-medium text-[var(--text)]">{label} <span className="text-red-500">*</span></label>{children}</div>
}
export function RmEditTicketForm({ ticketId, initial, defaultOpen = false, onClose, trigger }: { ticketId: string; initial: { title: string; category: string; impact: string; priority: string; description: string }; defaultOpen?: boolean; onClose?: () => void; trigger?: (open: () => void) => ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [title, setTitle] = useState(initial.title)
  const [category, setCategory] = useState(initial.category || 'General')
  const [impact, setImpact] = useState(initial.impact || 'none')
  const [priority, setPriority] = useState(initial.priority || 'P3')
  const [description, setDescription] = useState(initial.description)
  const close = () => { setOpen(false); onClose?.() }
  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'

  async function save() {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description, category, operational_impact: impact, priority }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to save')
      setBusy(false); close(); router.refresh()   // reset busy so a second edit isn't stuck on "Saving…"
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (!defaultOpen &&
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"><Pencil size={13} /> Edit ticket</button>
      )}
      {open && (
        <Modal maxWidth="max-w-lg" title="Edit ticket" onClose={() => { if (!busy) close() }}>
          <ReqLabel label="Title"><input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" /></ReqLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ReqLabel label="Category"><select className={input} value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></ReqLabel>
            <ReqLabel label="Priority"><select className={input} value={priority} onChange={e => setPriority(e.target.value)}>{PRIORITIES.map(p => <option key={p.v} value={p.v}>{p.label}</option>)}</select></ReqLabel>
          </div>
          <ReqLabel label="Operational Impact"><select className={input} value={impact} onChange={e => setImpact(e.target.value)}>{IMPACTS.map(i => <option key={i.v} value={i.v}>{i.label}</option>)}</select></ReqLabel>
          <ReqLabel label="Description">
            <div className="relative">
              <textarea maxLength={MAX_EDIT_DESC} className={`${input} min-h-[120px] pb-7`} value={description} onChange={e => setDescription(e.target.value.slice(0, MAX_EDIT_DESC))} placeholder="Description" />
              <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] tabular-nums text-[var(--text-faint)]">{description.length} / {MAX_EDIT_DESC}</span>
            </div>
          </ReqLabel>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={close} disabled={busy} className="flex-1 py-2.5 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm font-medium disabled:opacity-50">Cancel</button>
            <button disabled={busy} onClick={save} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save changes'}</button>
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

// ── Quote review (approve / decline with reason) ────────────────
export interface ReviewQuote { id: string; supplierName: string; amount: number; amountInclVat: number | null; description: string | null; fileUrl: string | null; createdAt: string; proposedScheduleAt?: string | null }
const DECLINE_REASONS = ['Price too high', 'Scope unclear / incomplete', 'Choosing another supplier', 'Lead time too long', 'Other']

export function QuoteReviewCard({ ticketId, quotes }: { ticketId: string; quotes: ReviewQuote[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [declineFor, setDeclineFor] = useState<string | null>(null)
  const [approveFor, setApproveFor] = useState<string | null>(null)
  const [reason, setReason] = useState(DECLINE_REASONS[0])
  const [other, setOther] = useState('')
  const [err, setErr] = useState('')
  if (!quotes.length) return <p className="text-sm text-[var(--text-faint)]">No quotes submitted yet.</p>

  async function decide(quoteId: string, action: 'approve' | 'decline') {
    setBusy(quoteId); setErr('')
    const declineReason = action === 'decline' ? (reason === 'Other' ? (other.trim() || 'Other') : reason) : undefined
    try {
      // Declining just declines the quote (with the reason) — the supplier is NOT
      // auto-asked to re-quote; that only happens via the "Ask to re-quote" button.
      await post(`/api/tickets/${ticketId}/quote-decision`, { action, quoteId, reason: declineReason })
      router.refresh()
    }
    catch (e: any) { setErr(e.message); setBusy(null) }
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'
  return (
    <div className="space-y-3">
      {quotes.map(q => (
        <div key={q.id} className="rounded-xl ring-1 ring-[var(--border)] p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[var(--text)] min-w-0 truncate">{q.supplierName}</span>
            <span className="text-base font-bold text-[var(--text)] shrink-0">{formatCurrency(q.amount)}</span>
          </div>
          <p className="text-[11px] text-[var(--text-faint)]">Received {formatDateTime(q.createdAt)}{q.amountInclVat ? ` · incl VAT ${formatCurrency(q.amountInclVat)}` : ''}</p>
          {q.proposedScheduleAt && (
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/30 px-2.5 py-1 text-[13px]">
              <CalendarClock size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="text-[var(--text-muted)]">Proposed visit</span>
              <span className="font-semibold text-[var(--text)]">{formatDateTime(q.proposedScheduleAt)}</span>
            </div>
          )}
          {q.description && <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{q.description}</p>}
          {q.fileUrl && <ViewTrackedLink ticketId={ticketId} itemType="quote" itemLabel={`${q.supplierName}'s quote`} href={q.fileUrl} className="text-sm text-[#f59e0b] underline">View attachment</ViewTrackedLink>}

          {declineFor === q.id ? (
            <div className="space-y-2 pt-1">
              <select className={input} value={reason} onChange={e => setReason(e.target.value)}>{DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>
              {reason === 'Other' && <textarea className={`${input} min-h-[60px]`} placeholder="Reason…" value={other} onChange={e => setOther(e.target.value)} />}
              <div className="flex gap-2">
                <button onClick={() => decide(q.id, 'decline')} disabled={busy === q.id} className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">Confirm decline</button>
                <button onClick={() => setDeclineFor(null)} className="px-3 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Back</button>
              </div>
            </div>
          ) : approveFor === q.id ? (
            <div className="space-y-2 pt-1">
              <p className="text-sm text-[var(--text)]">Approve and award <span className="font-semibold">{q.supplierName}</span>? Other quotes for this ticket will be declined.</p>
              <div className="flex gap-2">
                <button onClick={() => decide(q.id, 'approve')} disabled={busy === q.id} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">{busy === q.id ? '…' : 'Yes, approve'}</button>
                <button onClick={() => setApproveFor(null)} className="px-3 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 pt-1">
              <button onClick={() => setApproveFor(q.id)} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold">Approve</button>
              <button onClick={() => { setDeclineFor(q.id); setReason(DECLINE_REASONS[0]); setOther('') }} className="px-3 py-2 rounded-lg ring-1 ring-red-500/40 text-red-600 dark:text-red-400 text-sm font-semibold">Decline</button>
            </div>
          )}
        </div>
      ))}
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  )
}

// ── Quoting workspace shown inside the RM's "Next action" block ──────
// One list of the requested suppliers; a supplier that has submitted a quote is
// a clickable item that pops up the full quote (amount, visit, description,
// attachment) with Approve / Decline — those actions live in both the pop-up and
// on the block row. Replaces the standalone "Quotes" section.
export interface QuotePanelQuote { id: string; amount: number; amountInclVat: number | null; description: string | null; fileUrl: string | null; createdAt: string; validUntil?: string | null; proposedScheduleAt?: string | null }
export interface QuotePanelRow { supplierId: string; name: string; requestedAt: string | null; kind: 'waiting' | 'received' | 'accepted' | 'declined'; declineReason: string | null; quote: QuotePanelQuote | null }

const PANEL_META: Record<QuotePanelRow['kind'], { dot: string; label: string; txt: string }> = {
  waiting: { dot: 'bg-amber-500', label: 'Waiting for quote', txt: 'text-amber-700 dark:text-amber-400' },
  received: { dot: 'bg-emerald-500', label: 'Quote received', txt: 'text-emerald-600 dark:text-emerald-400' },
  accepted: { dot: 'bg-emerald-500', label: 'Accepted', txt: 'text-emerald-600 dark:text-emerald-400' },
  declined: { dot: 'bg-red-500', label: 'Declined', txt: 'text-red-600 dark:text-red-400' },
}

export function RmQuotePanel({ ticketId, rows, canReQuote }: { ticketId: string; rows: QuotePanelRow[]; canReQuote: boolean }) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)      // supplierId whose quote pop-up is open
  const [mode, setMode] = useState<'view' | 'approve' | 'decline'>('view')
  const [selectedId, setSelectedId] = useState<string | null>(null)   // radio-selected received quote
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState(DECLINE_REASONS[0])
  const [other, setOther] = useState('')
  const [requote, setRequote] = useState(false)   // decline → also ask for a revised quote
  const [err, setErr] = useState('')
  const active = rows.find(r => r.supplierId === openId) ?? null
  const receivedIds = new Set(rows.filter(r => r.kind === 'received').map(r => r.supplierId))
  const selectedReceived = selectedId && receivedIds.has(selectedId)

  function openModal(id: string, m: 'view' | 'approve' | 'decline' = 'view') { setOpenId(id); setMode(m); setReason(DECLINE_REASONS[0]); setOther(''); setRequote(false); setErr('') }
  async function decide(quoteId: string, action: 'approve' | 'decline') {
    setBusy(true); setErr('')
    const declineReason = action === 'decline' ? (reason === 'Other' ? (other.trim() || 'Other') : reason) : undefined
    try {
      await post(`/api/tickets/${ticketId}/quote-decision`, { action, quoteId, reason: declineReason })
      // If the RM ticked "also ask for a revised quote", re-invite the just-declined
      // supplier straight away (the requote action acts on the now-declined quote).
      if (action === 'decline' && requote) await post(`/api/tickets/${ticketId}/quote-decision`, { action: 'requote', quoteId })
      setBusy(false); setOpenId(null); router.refresh()
    }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }
  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'

  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Suppliers &amp; quotes</p>
      {/* Bare stacked rows (no box). Received quotes get a radio — the RM selects
          one, then a single Approve / Decline pair appears (saves space vs a pair
          under every row). */}
      <div className="divide-y divide-[var(--border)]">
        {rows.map(r => {
          const m = PANEL_META[r.kind]
          const isReceived = r.kind === 'received'
          return (
            <div key={r.supplierId} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <label className={`flex items-center gap-2 min-w-0 ${isReceived ? 'cursor-pointer' : ''}`}>
                  {isReceived
                    ? <input type="radio" name={`rmq-${ticketId}`} checked={selectedId === r.supplierId} onChange={() => setSelectedId(r.supplierId)} onClick={() => { if (selectedId === r.supplierId) setSelectedId(null) }} className="h-4 w-4 shrink-0 accent-emerald-600" />
                    : <i className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.dot}`} />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-[var(--text)]">{r.name}</span>
                    {r.requestedAt && <span className="text-[11px] text-[var(--text-faint)]">requested {formatDateTime(r.requestedAt)}</span>}
                  </span>
                </label>
                {r.quote ? (
                  <button type="button" onClick={() => openModal(r.supplierId)} className={`flex items-center gap-1.5 shrink-0 text-[11px] font-semibold ${m.txt} hover:underline`}>
                    {m.label} · {formatCurrency(r.quote.amount)} <FileText size={13} />
                  </button>
                ) : (
                  <span className={`text-[11px] font-semibold shrink-0 ${m.txt}`}>{m.label}</span>
                )}
              </div>
              {r.kind === 'declined' && r.declineReason && (
                <div className="mt-2 rounded-lg bg-red-500/10 ring-1 ring-red-500/30 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Decline reason</p>
                  <p className="text-sm text-[var(--text)]">{r.declineReason}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* One Approve / Decline pair for the selected received quote. */}
      {selectedReceived && (
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => openModal(selectedId!, 'approve')} className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition">Approve selected</button>
          <button type="button" onClick={() => openModal(selectedId!, 'decline')} className="flex-1 py-2 rounded-lg ring-1 ring-red-500/40 text-red-600 dark:text-red-400 text-xs font-semibold transition hover:bg-red-500/10">Decline selected</button>
        </div>
      )}

      {active?.quote && (
        <Modal title="Review quote" maxWidth="max-w-5xl" onClose={() => setOpenId(null)}>
          <QuoteSummary
            quote={{ id: active.quote.id, supplierName: active.name, amount: active.quote.amount, amountInclVat: active.quote.amountInclVat, description: active.quote.description, fileUrl: active.quote.fileUrl, validUntil: active.quote.validUntil ?? null, createdAt: active.quote.createdAt }}
            status={active.kind === 'accepted' ? 'accepted' : active.kind === 'declined' ? 'declined' : 'pending'}
            title={`${active.name}'s quote`}
            schedule={active.quote.proposedScheduleAt ? { at: active.quote.proposedScheduleAt, proposed: true, audience: 'rm' } : null}
            ticketId={ticketId} declineReason={active.declineReason}
          />

          {active.kind === 'received' && (
            mode === 'decline' ? (
              <div className="space-y-2 pt-1">
                <select className={input} value={reason} onChange={e => setReason(e.target.value)}>{DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>
                {reason === 'Other' && <textarea className={`${input} min-h-[60px]`} placeholder="Reason…" value={other} onChange={e => setOther(e.target.value)} />}
                <label className="flex items-start gap-2 rounded-lg bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-muted)] ring-1 ring-[var(--border)]">
                  <input type="checkbox" checked={requote} onChange={e => setRequote(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                  Also ask this supplier to submit a revised quote
                </label>
                <div className="flex gap-2">
                  <button onClick={() => decide(active.quote!.id, 'decline')} disabled={busy} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">Confirm decline</button>
                  <button onClick={() => setMode('view')} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Back</button>
                </div>
              </div>
            ) : mode === 'approve' ? (
              <div className="space-y-2 pt-1">
                <p className="text-sm text-[var(--text)]">Approve and award <span className="font-semibold">{active.name}</span>? Other quotes for this ticket will be declined.</p>
                <div className="flex gap-2">
                  <button onClick={() => decide(active.quote!.id, 'approve')} disabled={busy} className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">{busy ? '…' : 'Yes, approve'}</button>
                  <button onClick={() => setMode('view')} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 pt-1">
                <button onClick={() => setMode('approve')} className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition">Approve</button>
                <button onClick={() => setMode('decline')} className="flex-1 py-2 rounded-lg ring-1 ring-red-500/40 text-red-600 dark:text-red-400 text-sm font-semibold transition hover:bg-red-500/10">Decline</button>
              </div>
            )
          )}
          {active.kind === 'declined' && canReQuote && <div className="pt-1"><ReQuoteButton ticketId={ticketId} quoteId={active.quote.id} /></div>}
          {err && <p className="text-xs text-red-500">{err}</p>}
        </Modal>
      )}
    </div>
  )
}

// ── Generic review panel (COC/POC · snag · VO) — mirrors the quote panel ─────
// A compact clickable summary row in the "Next action" block that pops up the
// full detail + the action buttons (composed on the server and passed in as
// `body`). Same look as RmQuotePanel so every pending decision reads the same.
export function RmReviewPanel({ heading, items }: {
  heading?: string
  items: { id: string; dot: string; title: string; subtitle?: string | null; statusLabel: string; statusCls: string; modalTitle?: string; body: ReactNode }[]
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const active = items.find(i => i.id === openId) ?? null
  if (!items.length) return null
  return (
    <div className="space-y-2">
      {heading && <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{heading}</p>}
      <div className="divide-y divide-[var(--border)]">
        {items.map(it => (
          <button key={it.id} type="button" onClick={() => setOpenId(it.id)} className="w-full py-2 flex items-center justify-between gap-2 text-left transition hover:bg-[var(--hover)]">
            <span className="flex items-center gap-2 min-w-0">
              <i className={`w-2.5 h-2.5 rounded-full shrink-0 ${it.dot}`} />
              <span className="min-w-0">
                <span className="block truncate text-sm text-[var(--text)]">{it.title}</span>
                {it.subtitle && <span className="text-[11px] text-[var(--text-faint)]">{it.subtitle}</span>}
              </span>
            </span>
            <span className={`flex items-center gap-1.5 shrink-0 text-[11px] font-semibold ${it.statusCls}`}>{it.statusLabel} <FileText size={13} /></span>
          </button>
        ))}
      </div>
      {active && (
        <Modal title={active.modalTitle ?? active.title} maxWidth="max-w-3xl" onClose={() => setOpenId(null)}>
          {active.body}
        </Modal>
      )}
    </div>
  )
}

// ── RM completion review (COC & POC submitted) — inline "Next action" block ──
// A tap-to-review summary of the submission (photo/document/note counts) that
// opens the full "Sign off completion" pop-up (photos · COC · notes + rating +
// approve/more), plus an "Approve completion" button (same pop-up) and a "More"
// menu holding Raise snag / Request more evidence for quick access.
export function RmCompletionReview({ ticketId, label, submittedAt, photoCount, docCount, noteCount, beforeUrls, afterUrls, cocUrl, invoiceUrl, notes }: {
  ticketId: string; label: string; submittedAt: string; photoCount: number; docCount: number; noteCount: number
  beforeUrls: string[]; afterUrls: string[]; cocUrl: string | null; invoiceUrl: string | null; notes: string | null
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<'evidence' | 'snag' | null>(null)
  const done = () => setActive(null)
  const submission: SignoffSubmission = { id: '', label, createdAt: submittedAt, beforeUrls, afterUrls, cocUrl, invoiceUrl, notes }
  return (
    <div className="space-y-3">
      {/* Tap the summary to open the full submission for review + sign-off. */}
      <button type="button" onClick={() => setOpen(true)} className="w-full rounded-lg bg-[var(--surface)] p-4 text-left ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-500/15 text-blue-500"><ClipboardCheck size={16} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[var(--text)]">{label}</span>
            <span className="block text-[11px] text-[var(--text-faint)]">Submitted {formatDateTime(submittedAt)}</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-[var(--text-faint)]" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[var(--text-muted)] sm:gap-x-6">
          <span className="flex items-center gap-1.5"><ImageIcon size={15} className="text-[var(--text-faint)]" /> <span className="font-semibold text-[var(--text)]">{photoCount}</span> Photo{photoCount === 1 ? '' : 's'}</span>
          <span className="flex items-center gap-1.5"><FileText size={15} className="text-[var(--text-faint)]" /> <span className="font-semibold text-[var(--text)]">{docCount}</span> Document{docCount === 1 ? '' : 's'}</span>
          <span className="flex items-center gap-1.5"><MessageSquare size={15} className="text-[var(--text-faint)]" /> <span className="font-semibold text-[var(--text)]">{noteCount}</span> Note{noteCount === 1 ? '' : 's'}</span>
        </div>
      </button>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"><CheckCircle2 size={16} /> Approve completion</button>
        <MoreMenu>
          <MoreActionItem icon={<AlertTriangle size={16} />} label="Raise snag" onClick={() => setActive('snag')} />
          <MoreActionItem icon={<MessageSquare size={16} />} label="Request more evidence" onClick={() => setActive('evidence')} />
        </MoreMenu>
      </div>

      {open && (
        <Modal title="Sign off completion" maxWidth="max-w-3xl" onClose={() => setOpen(false)}>
          <SignoffReviewPanel ticketId={ticketId} s={submission} onDone={() => setOpen(false)} />
        </Modal>
      )}
      {active === 'evidence' && <RequestEvidenceButton ticketId={ticketId} defaultOpen onClose={done} />}
      {active === 'snag' && <RaiseSnagButton ticketId={ticketId} defaultOpen onClose={done} />}
    </div>
  )
}

// ── Quote comparison pop-up (Today "Approve quote") ─────────────────────────
// Compare received quotes side by side, pick one (radio), and approve / decline it.
function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'expired'
  const totalMin = Math.floor(ms / 60000)
  const d = Math.floor(totalMin / 1440), h = Math.floor((totalMin % 1440) / 60), m = totalMin % 60
  return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`
}
function DetailCell({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-[var(--text-faint)]">{icon}</span>
      <span className="min-w-0"><span className="block text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</span><span className="block text-sm text-[var(--text)]">{value}</span></span>
    </div>
  )
}

export function QuoteComparison({ ticketId, rows, onClose }: { ticketId: string; rows: QuotePanelRow[]; onClose: () => void }) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailFor, setDetailFor] = useState<string | null>(null)
  const [declineMode, setDeclineMode] = useState(false)
  const [reason, setReason] = useState(DECLINE_REASONS[0])
  const [other, setOther] = useState('')
  const [requote, setRequote] = useState(false)   // decline → also ask for a revised quote
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const received = rows.filter(r => r.kind === 'received' && r.quote)
  const awaiting = rows.filter(r => r.kind === 'waiting')
  const selected = received.find(r => r.supplierId === selectedId) ?? null

  const soonest = received.map(r => r.quote?.validUntil).filter(Boolean).map(v => new Date(v as string).getTime()).sort((a, b) => a - b)[0]
  // eslint-disable-next-line react-hooks/purity -- cosmetic "valid for" countdown; not hydration-critical
  const validFor = soonest ? fmtCountdown(soonest - Date.now()) : null
  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'

  async function decide(action: 'approve' | 'decline') {
    if (!selected?.quote) return
    setBusy(true); setErr('')
    const declineReason = action === 'decline' ? (reason === 'Other' ? (other.trim() || 'Other') : reason) : undefined
    const qid = selected.quote.id
    try {
      await post(`/api/tickets/${ticketId}/quote-decision`, { action, quoteId: qid, reason: declineReason })
      // Ticked "also ask for a revised quote" → re-invite the just-declined supplier.
      if (action === 'decline' && requote) await post(`/api/tickets/${ticketId}/quote-decision`, { action: 'requote', quoteId: qid })
      router.refresh()
    }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <>
      <p className="-mt-1 text-sm text-[var(--text-muted)]">Compare supplier quotes and approve the best option.</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2.5 text-sm text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {received.length} quote{received.length !== 1 ? 's' : ''} received</span>
          {awaiting.length > 0 && <><span className="text-[var(--text-faint)]">·</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> {awaiting.length} awaiting response</span></>}
        </p>
        {validFor && <p className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">Quotes valid for <span className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400"><Clock size={13} /> {validFor}</span></p>}
      </div>

      {awaiting.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Awaiting quote</p>
          {awaiting.map(r => (
            <div key={r.supplierId} className="flex items-center justify-between gap-3 rounded-xl border-l-4 border-amber-500 bg-[var(--surface)] px-4 py-3 ring-1 ring-[var(--border)]">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"><Clock size={18} /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-bold text-[var(--text)]">{r.name}</span><span className="text-xs font-medium text-amber-600 dark:text-amber-400">Awaiting quote</span>{r.requestedAt && <span className="block text-[11px] text-[var(--text-faint)]">Requested {formatDateTime(r.requestedAt)}</span>}</span>
              </span>
              <span className="shrink-0 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Awaiting</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Received quotes ({received.length})</p>
        {received.map(r => {
          const on = selectedId === r.supplierId
          const q = r.quote!
          return (
            <div key={r.supplierId} className={`rounded-xl bg-[var(--surface)] ring-1 transition ${on ? 'ring-emerald-500' : 'ring-[var(--border)]'}`}>
              <label className="flex cursor-pointer items-start justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 items-start gap-3">
                  {/* Avatar chip is sm+ — phones give its width back to the supplier name. */}
                  <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 sm:grid"><Store size={18} /></span>
                  <span className="min-w-0"><span className="block truncate text-sm font-bold text-[var(--text)]">{r.name}</span><span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Quote received</span><span className="block text-[11px] text-[var(--text-faint)]">Received {formatDateTime(q.createdAt)}</span></span>
                </span>
                <span className="flex shrink-0 items-start gap-3">
                  <span className="text-right"><span className="block text-lg font-bold tabular-nums text-[var(--text)]">{formatCurrency(q.amount)}</span><span className="block text-[11px] text-[var(--text-faint)]">excl VAT</span>{q.amountInclVat != null && <span className="hidden text-[11px] text-[var(--text-faint)] sm:block">{formatCurrency(q.amountInclVat)} incl VAT</span>}</span>
                  {q.fileUrl && <FileText size={16} className="mt-0.5 text-emerald-600 dark:text-emerald-400" />}
                  <input type="radio" name="qc" checked={on} onChange={() => setSelectedId(r.supplierId)} onClick={() => { if (selectedId === r.supplierId) setSelectedId(null) }} className="mt-1 h-4 w-4 accent-emerald-600" />
                </span>
              </label>
              <div className="mx-4 grid grid-cols-1 gap-y-2 border-t border-[var(--border)] py-3 sm:grid-cols-2 sm:gap-x-4">
                <DetailCell icon={<Calendar size={14} />} label="Proposed visit" value={q.proposedScheduleAt ? formatDateTime(q.proposedScheduleAt) : '—'} />
                <DetailCell icon={<ShieldCheck size={14} />} label="Valid until" value={q.validUntil ? formatDate(q.validUntil) : 'N/A'} />
              </div>
              <div className="border-t border-[var(--border)]">
                <button type="button" onClick={() => setDetailFor(detailFor === r.supplierId ? null : r.supplierId)} className="flex w-full items-center justify-center gap-1 py-2.5 text-sm font-semibold text-emerald-600 transition hover:bg-[var(--hover)] dark:text-emerald-400">View quote details <ChevronRight size={15} className={detailFor === r.supplierId ? 'rotate-90 transition-transform' : 'transition-transform'} /></button>
                {detailFor === r.supplierId && <div className="px-4 pb-4"><QuoteSummary quote={{ id: q.id, supplierName: r.name, amount: q.amount, amountInclVat: q.amountInclVat, description: q.description, fileUrl: q.fileUrl, validUntil: q.validUntil ?? null, createdAt: q.createdAt }} status="pending" title={`${r.name}'s quote`} schedule={q.proposedScheduleAt ? { at: q.proposedScheduleAt, proposed: true } : null} ticketId={ticketId} /></div>}
              </div>
            </div>
          )
        })}
        {!received.length && <p className="rounded-xl bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--text-faint)] ring-1 ring-[var(--border)]">No quotes received yet.</p>}
      </div>

      {declineMode && selected && (
        <div className="space-y-2 rounded-xl bg-[var(--input-bg)] p-3 ring-1 ring-[var(--border)]">
          <p className="text-sm text-[var(--text)]">Decline <span className="font-semibold">{selected.name}</span>&apos;s quote — choose a reason:</p>
          <select className={input} value={reason} onChange={e => setReason(e.target.value)}>{DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>
          {reason === 'Other' && <textarea className={`${input} min-h-[60px]`} placeholder="Reason…" value={other} onChange={e => setOther(e.target.value)} />}
          <label className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
            <input type="checkbox" checked={requote} onChange={e => setRequote(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
            Also ask this supplier to submit a revised quote
          </label>
        </div>
      )}

      {awaiting.length > 0 && selected && !declineMode && (
        <div className="flex items-start gap-2.5 rounded-xl bg-blue-500/10 px-3.5 py-3 ring-1 ring-blue-500/25">
          <Info size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-[var(--text-muted)]">Approving the selected quote will withdraw the outstanding request{awaiting.length === 1 ? ` from ${awaiting[0].name}` : 's'}.</p>
        </div>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}

      {/* Footer CTAs stack full-width on phones (three ~150px buttons wrap unevenly
          at 375px); sm+ keeps the flex-wrap row. */}
      <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3 sm:flex-row sm:flex-wrap">
        <button type="button" onClick={onClose} disabled={busy} className="w-full rounded-xl py-2.5 text-sm font-medium text-[var(--text)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-50 sm:w-auto sm:min-w-[130px] sm:flex-1">Wait for all quotes</button>
        <button type="button" disabled={!selected || busy} onClick={() => declineMode ? decide('decline') : setDeclineMode(true)} className="w-full rounded-xl py-2.5 text-sm font-semibold text-red-600 ring-1 ring-red-500/50 transition hover:bg-red-500/10 disabled:opacity-40 dark:text-red-400 sm:w-auto sm:min-w-[130px] sm:flex-1">{busy && declineMode ? 'Declining…' : declineMode ? 'Confirm decline' : 'Decline selected quote'}</button>
        {declineMode
          ? <button type="button" disabled={busy} onClick={() => setDeclineMode(false)} className="w-full rounded-xl py-2.5 text-sm font-semibold text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-50 sm:w-auto sm:min-w-[130px] sm:flex-1">Cancel decline</button>
          : <button type="button" disabled={!selected || busy} onClick={() => decide('approve')} className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40 sm:w-auto sm:min-w-[130px] sm:flex-1">{busy ? 'Approving…' : 'Approve selected quote'}</button>}
      </div>
    </>
  )
}

// Today-queue "Approve quote" pop-up: fetches the ticket's quote-panel rows on
// open (they're not in the queue payload) and shows the QuoteComparison — compare,
// select and approve/decline in place, no navigating into the ticket.
export function QuoteReviewButton({ ticketId, trigger }: { ticketId: string; trigger: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ rows: QuotePanelRow[]; canReQuote: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) return
    let live = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets fetch state when the pop-up opens, before the async load; cannot run during render
    setLoading(true); setErr('')
    fetch(`/api/tickets/${ticketId}/quotes`)
      .then(r => r.json())
      .then(d => { if (!live) return; if (d?.error) setErr(d.error); else setData(d) })
      .catch(() => { if (live) setErr('Could not load the quotes.') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [open, ticketId])
  return (
    <>
      {trigger(() => setOpen(true))}
      {open && (
        <Modal title="Review supplier quotes" maxWidth="max-w-5xl" onClose={() => setOpen(false)}>
          {loading ? <p className="py-4 text-center text-sm text-[var(--text-faint)]">Loading…</p>
            : err ? <p className="text-sm text-red-500">{err}</p>
            : data ? (data.rows.length ? <QuoteComparison ticketId={ticketId} rows={data.rows} onClose={() => setOpen(false)} /> : <p className="text-sm text-[var(--text-faint)]">No quotes yet.</p>)
            : null}
        </Modal>
      )}
    </>
  )
}

// Today-queue "Sign off" pop-up: fetches the submission currently under review
// and shows it + Accept COC/POC / Request evidence / Raise snag in place, so the
// RM can sign off from the queue without navigating into the ticket.
type SignoffSubmission = { id: string; label: string; createdAt: string; beforeUrls: string[]; afterUrls: string[]; cocUrl: string | null; invoiceUrl: string | null; notes: string | null }

export function SignoffReviewButton({ ticketId, trigger }: { ticketId: string; trigger: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ submission: SignoffSubmission | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) return
    let live = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets fetch state when the pop-up opens, before the async load; cannot run during render
    setLoading(true); setErr('')
    fetch(`/api/tickets/${ticketId}/signoff`)
      .then(r => r.json())
      .then(d => { if (!live) return; if (d?.error) setErr(d.error); else setData(d) })
      .catch(() => { if (live) setErr('Could not load the submission.') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [open, ticketId])
  return (
    <>
      {trigger(() => setOpen(true))}
      {open && (
        <Modal title="Sign off completion" maxWidth="max-w-3xl" onClose={() => setOpen(false)}>
          {loading ? <p className="py-4 text-center text-sm text-[var(--text-faint)]">Loading…</p>
            : err ? <p className="text-sm text-red-500">{err}</p>
            : data?.submission ? <SignoffReviewPanel ticketId={ticketId} s={data.submission} onDone={() => setOpen(false)} />
            : <p className="text-sm text-[var(--text-faint)]">Nothing awaiting your sign-off on this ticket.</p>}
        </Modal>
      )}
    </>
  )
}

// Best-effort filename from a (possibly signed) storage URL.
function docName(url: string, fallback: string): string {
  try {
    const raw = decodeURIComponent((url.split('?')[0].split('/').pop() || '').trim())
    return raw.replace(/^\d{6,}-[a-z0-9]{4,}-/i, '') || fallback
  } catch { return fallback }
}

const REVIEW_LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]'

// A document row (COC / invoice): PDF icon + filename + uploaded time, with a
// "View …" link on the right.
function DocRow({ ticketId, url, itemType, itemLabel, uploadedAt, viewLabel }: {
  ticketId: string; url: string; itemType: 'coc' | 'invoice'; itemLabel: string; uploadedAt: string; viewLabel: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--surface-2)] p-3 ring-1 ring-[var(--border)]">
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-red-500/15 text-red-600 dark:text-red-400"><FileText size={18} /></span>
        <span className="min-w-0">
          {/* Wraps to two lines on phones so the filename stays readable. */}
          <span className="line-clamp-2 break-all text-sm font-semibold text-[var(--text)] sm:line-clamp-none sm:block sm:truncate">{docName(url, itemLabel)}</span>
          <span className="block text-[11px] text-[var(--text-faint)]">Uploaded {formatDateTime(uploadedAt)}</span>
        </span>
      </span>
      <ViewTrackedLink ticketId={ticketId} itemType={itemType} itemLabel={itemLabel} href={url} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-blue-600 transition hover:underline dark:text-blue-400">{viewLabel} <ChevronRight size={15} /></ViewTrackedLink>
    </div>
  )
}

// The rich "Sign off completion" review panel — used in BOTH the RM ticket's
// Next-action pop-up and the Today-queue sign-off pop-up. Shows the full
// submission (photos · COC · notes) + a star rating, with "Approve completion"
// and a "More actions" menu (Request more evidence / Raise a snag).
export function SignoffReviewPanel({ ticketId, s, onDone }: { ticketId: string; s: SignoffSubmission; onDone?: () => void }) {
  const router = useRouter()
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sub, setSub] = useState<'evidence' | 'snag' | null>(null)
  const photos = [...s.beforeUrls, ...s.afterUrls]
  const closeSub = () => setSub(null)

  async function approve() {
    if (!score) { setErr('Please give the supplier a star rating before accepting.'); return }
    setBusy(true); setErr('')
    try {
      await post(`/api/ratings`, { ticketId, score, comment })
      await post(`/api/tickets/${ticketId}/transition`, { action: 'approve' })
      onDone?.(); router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {/* Submission detail — photos / COC / notes, each under its own rule. */}
      <div className="overflow-hidden rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-[var(--border)] px-4 py-3">
          <FileText size={16} className="shrink-0 text-blue-500" />
          <span className="text-sm font-bold text-[var(--text)]">{s.label}</span>
          <span className="text-[var(--text-faint)]">·</span>
          <span className="text-[13px] text-[var(--text-faint)]">{formatDateTime(s.createdAt)}</span>
        </div>
        <div className="space-y-4 p-4">
          <div>
            <div className={REVIEW_LABEL}>Proof of completion</div>
            <div className="mt-2">
              {photos.length ? <PhotoThumbs urls={photos} ticketId={ticketId} label="Completion photo" limit={4} /> : <span className="text-sm text-[var(--text-faint)]">No photos</span>}
            </div>
          </div>
          <div className="border-t border-[var(--border)] pt-4">
            <div className={REVIEW_LABEL}>Certificate of completion</div>
            <div className="mt-2 space-y-2">
              {s.cocUrl ? <DocRow ticketId={ticketId} url={s.cocUrl} itemType="coc" itemLabel="COC" uploadedAt={s.createdAt} viewLabel="View COC" /> : <span className="text-sm text-[var(--text-faint)]">No certificate uploaded</span>}
              {s.invoiceUrl && <DocRow ticketId={ticketId} url={s.invoiceUrl} itemType="invoice" itemLabel="Invoice" uploadedAt={s.createdAt} viewLabel="View invoice" />}
            </div>
          </div>
          <div className="border-t border-[var(--border)] pt-4">
            <div className={REVIEW_LABEL}>Notes</div>
            {s.notes?.trim() ? <p className="mt-1 text-sm text-[var(--text-muted)] whitespace-pre-line">{s.notes}</p> : <span className="text-sm text-[var(--text-faint)]">No notes added</span>}
          </div>
        </div>
      </div>

      {/* Rate the supplier (required before accepting). */}
      <div className="space-y-2 rounded-xl p-4 ring-1 ring-[var(--border)]">
        <p className="text-sm font-semibold text-[var(--text)]">Rate the supplier, then accept the COC &amp; POC</p>
        <StarInput value={score} onChange={setScore} />
        <p className="text-[11px] text-[var(--text-faint)]">Tap a star to rate</p>
        <div className="relative">
          <textarea maxLength={250} value={comment} onChange={e => setComment(e.target.value.slice(0, 250))} placeholder="Comment on the supplier's work (optional)"
            className="min-h-[64px] w-full rounded-lg bg-[var(--input-bg)] px-3 py-2 pb-6 text-sm text-[var(--text)] ring-1 ring-[var(--border)]" />
          <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] tabular-nums text-[var(--text-faint)]">{comment.length}/250</span>
        </div>
      </div>

      {err && <p className="text-xs text-red-500">{err}</p>}

      <div className="flex items-center gap-2">
        <MoreMenu label="More actions" up align="left">
          <MoreActionItem icon={<MessageSquare size={16} />} label="Request more evidence" onClick={() => setSub('evidence')} />
          <MoreActionItem icon={<AlertTriangle size={16} />} label="Raise a snag" tone="danger" onClick={() => setSub('snag')} />
        </MoreMenu>
        <button onClick={approve} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"><CheckCircle2 size={16} /> {busy ? 'Approving…' : 'Approve completion'}</button>
      </div>

      {sub === 'evidence' && <RequestEvidenceButton ticketId={ticketId} defaultOpen onClose={closeSub} />}
      {sub === 'snag' && <RaiseSnagButton ticketId={ticketId} defaultOpen onClose={closeSub} />}
    </div>
  )
}

// ── RM adds extra work to the ticket (before a supplier is assigned) ─
const MAX_WORK_CHARS = 1000
const MAX_WORK_PHOTOS = 5
export function RmAddWorkForm({ ticketId, description, photoUrls, title, category, impact, defaultOpen = false, onClose, trigger }: {
  ticketId: string; description: string; photoUrls: string[]; title: string; category: string; impact: string; defaultOpen?: boolean; onClose?: () => void; trigger?: (open: () => void) => ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const close = () => { setOpen(false); onClose?.() }
  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)]'

  // Object-URL thumbnails for the selected photos; revoked when the set changes.
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews])
  // Keep files the OS picker returned. On mobile the picked image often has an
  // empty MIME type (Android WebView), so require-image would silently drop it —
  // the `accept="image/*"` picker already limits selection, and the upload route
  // accepts an empty type, so only reject a clearly non-image type here.
  const addFiles = (list: FileList | null) => setFiles(p => [...p, ...Array.from(list ?? []).filter(f => !f.type || f.type.startsWith('image/'))].slice(0, MAX_WORK_PHOTOS))

  async function submit() {
    if (!text.trim()) { setErr('Describe the extra work needed.'); return }
    setBusy(true); setErr('')
    try {
      const { urls: newUrls, failed } = await uploadFiles(files, 'ticket-photos')
      if (failed.length) { setErr(`Couldn't upload ${failed.length} photo${failed.length > 1 ? 's' : ''}. Check the file type and try again.`); setBusy(false); return }
      const newDescription = `${description}\n\n— Extra Work: ${text.trim()}`
      // The ticket endpoint is PATCH-only — POSTing here was the "something went wrong".
      const res = await fetch(`/api/tickets/${ticketId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description: newDescription, category, operational_impact: impact, photo_urls: [...photoUrls, ...newUrls], edit_note: 'added extra work' }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to add the extra work.')
      setBusy(false); setText(''); setFiles([]); close(); router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (!defaultOpen &&
        <button onClick={() => setOpen(true)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition">
          <Plus size={16} /> Add extra work
        </button>
      )}
      {open && (
        <Modal title="Add extra work to this ticket" maxWidth="max-w-2xl" onClose={() => { if (!busy) { setErr(''); close() } }}>
          <p className="-mt-1 text-sm text-[var(--text-muted)]">Add any additional scope or tasks you want the supplier to include in their quote.</p>

          {/* Description + live character counter */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Describe the extra work needed <span className="text-red-500">*</span></label>
            <div className="relative">
              <textarea autoFocus maxLength={MAX_WORK_CHARS} className={`${input} min-h-[150px] pb-7`} placeholder="e.g. Install an additional shut-off valve and pressure-test the line…" value={text} onChange={e => { setText(e.target.value.slice(0, MAX_WORK_CHARS)); setErr('') }} />
              <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] tabular-nums text-[var(--text-faint)]">{text.length} / {MAX_WORK_CHARS}</span>
            </div>
          </div>

          {/* Photo grid — dashed upload tile + image thumbnails with remove */}
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--text)]">Add photos <span className="font-normal text-[var(--text-faint)]">(optional)</span></p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {files.length < MAX_WORK_PHOTOS && (
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[var(--border)] p-2 text-center text-[var(--text-muted)] transition hover:border-blue-500 hover:bg-[var(--hover)]">
                  <Camera size={20} className="text-[var(--text-faint)]" />
                  <span className="text-[11px] font-medium leading-tight">Upload photos</span>
                  <span className="text-[10px] leading-tight text-[var(--text-faint)]">PNG, JPG up to 10MB</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.currentTarget.value = '' }} />
                </label>
              )}
              {files.map((f, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-xl ring-1 ring-[var(--border)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL preview, not a remote asset */}
                  <img src={previews[i]} alt={f.name} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setFiles(p => p.filter((_, j) => j !== i))} aria-label="Remove photo" className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"><X size={13} /></button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--text-faint)]">{files.length} of {MAX_WORK_PHOTOS} photos added</p>
          </div>

          {/* Info callout */}
          <div className="flex items-start gap-2.5 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/25 px-3.5 py-3">
            <Info size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
            <p className="text-sm text-[var(--text-muted)]">This extra work will be included in the quote request sent to the supplier.</p>
          </div>

          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setErr(''); close() }} disabled={busy} className="flex-1 py-2.5 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm font-medium disabled:opacity-50">Cancel</button>
            <button onClick={submit} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Adding…' : 'Add to ticket'}</button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Variation order review (approve / decline) ──────────────────
const VO_DECLINE_REASONS = ['Cost too high', 'Not budgeted', 'Outside agreed scope', 'Needs more detail / justification', 'Obtain another quote', 'Other']
export function VariationReviewCard({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmApprove, setConfirmApprove] = useState(false)   // approve confirm sits over the buttons
  const [declineOpen, setDeclineOpen] = useState(false)         // decline is a pop-up
  const [reason, setReason] = useState('')
  const [other, setOther] = useState('')
  const [err, setErr] = useState('')
  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'

  async function act(action: 'approve_variation' | 'reject_variation', reasonText?: string) {
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action, reason: reasonText }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }
  function submitDecline() {
    if (!reason) { setErr('Choose a reason.'); return }
    const r = reason === 'Other' ? other.trim() : reason
    if (!r) { setErr('Enter a reason.'); return }
    act('reject_variation', r)
  }

  return (
    <div className="space-y-2">
      {confirmApprove ? (
        // "Are you sure?" replaces the buttons in place (no separate row).
        <div className="rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] p-3 space-y-2">
          <p className="text-sm text-[var(--text)]">Are you sure you want to approve the variation order?</p>
          <div className="flex gap-2">
            <button onClick={() => act('approve_variation')} disabled={busy} className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Approving…' : 'Yes, approve'}</button>
            <button onClick={() => setConfirmApprove(false)} disabled={busy} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Cancel</button>
          </div>
        </div>
      ) : (
        // Stack on phones — side by side both labels wrap to two lines at 375px.
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={() => { setErr(''); setConfirmApprove(true) }} className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition">Approve variation order</button>
          <button onClick={() => { setReason(''); setOther(''); setErr(''); setDeclineOpen(true) }} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition">Decline variation order</button>
        </div>
      )}
      {err && !declineOpen && <p className="text-xs text-red-500">{err}</p>}

      {declineOpen && (
        <Modal title="Decline variation order" onClose={() => { if (!busy) { setDeclineOpen(false); setErr('') } }}>
          <p className="text-xs text-[var(--text-muted)]">The supplier is notified. Choose why the variation order is declined.</p>
          <select autoFocus className={input} value={reason} onChange={e => { setReason(e.target.value); setErr('') }}>
            <option value="">— Choose a reason —</option>
            {VO_DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {reason === 'Other' && <textarea className={`${input} min-h-[80px]`} placeholder="Reason…" value={other} onChange={e => setOther(e.target.value)} />}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={submitDecline} disabled={busy} className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Declining…' : 'Decline variation order'}</button>
            <button onClick={() => { setDeclineOpen(false); setErr('') }} disabled={busy} className="flex-1 py-2 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Approve sign-off (rate the supplier first) ──────────────────
export function ApproveSignoffCard({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function approve() {
    if (!score) { setErr('Please give the supplier a star rating before accepting.'); return }
    setBusy(true); setErr('')
    try {
      await post(`/api/ratings`, { ticketId, score, comment })
      await post(`/api/tickets/${ticketId}/transition`, { action: 'approve' })
      router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="rounded-xl ring-1 ring-[var(--border)] p-4 space-y-3">
      <p className="text-sm font-semibold text-[var(--text)]">Rate the supplier, then accept the COC &amp; POC</p>
      <StarInput value={score} onChange={setScore} />
      <textarea className="w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm min-h-[60px]" placeholder="Comment on the supplier's work (optional)" value={comment} onChange={e => setComment(e.target.value)} />
      {err && <p className="text-xs text-red-500">{err}</p>}
      <button onClick={approve} disabled={busy} className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Submitting…' : 'Accept COC/POC'}</button>
    </div>
  )
}

// ── Accept a supplier's proposed (beyond-window) visit time ─────
export function AcceptScheduleCard({ ticketId, scheduledAt }: { ticketId: string; scheduledAt: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function accept() {
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'accept_schedule' }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <div className="rounded-xl ring-1 ring-indigo-500/40 bg-indigo-500/5 p-4 space-y-2">
      <p className="text-sm font-semibold text-[var(--text)]">Proposed visit time</p>
      <p className="text-sm text-[var(--text-muted)]">The supplier proposed <span className="font-semibold text-[var(--text)]">{formatDateTime(scheduledAt)}</span>, which is past the SLA window. Accept it so meeting it won&apos;t count as a breach, or leave it for the supplier to re-schedule.</p>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <button onClick={accept} disabled={busy} className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Accepting…' : 'Accept proposed time'}</button>
    </div>
  )
}

// ── Approve / decline a supplier's proposed snag-fix date ───────
const SNAG_SCHEDULE_DECLINE_REASONS = ['Date is too far out', 'Needs to be done sooner', 'Outside acceptable window', 'Clashes with store operations', 'Other']
export function AcceptSnagScheduleCard({ ticketId, scheduledAt }: { ticketId: string; scheduledAt: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [declineOpen, setDeclineOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [other, setOther] = useState('')
  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'

  async function approve() {
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'approve_snag' }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }
  async function decline() {
    if (!reason) { setErr('Choose a reason.'); return }
    const finalReason = reason === 'Other' ? other.trim() : reason
    if (!finalReason) { setErr('Tell the supplier why.'); return }
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'decline_snag_schedule', reason: finalReason }); setDeclineOpen(false); setBusy(false); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="rounded-xl ring-1 ring-indigo-500/40 bg-indigo-500/5 p-4 space-y-2">
      <p className="text-sm font-semibold text-[var(--text)]">Snag fix schedule</p>
      <p className="text-sm text-[var(--text-muted)]">The supplier proposed <span className="font-semibold text-[var(--text)]">{formatDateTime(scheduledAt)}</span> to carry out the corrective work. Approve to confirm, or decline to ask for a new date.</p>
      {err && !declineOpen && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button onClick={approve} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Approving…' : 'Approve snag schedule'}</button>
        <button onClick={() => { setReason(''); setOther(''); setErr(''); setDeclineOpen(true) }} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50">Decline</button>
      </div>
      {declineOpen && (
        <Modal title="Decline snag schedule" onClose={() => { if (!busy) { setDeclineOpen(false); setErr('') } }}>
          <p className="text-xs text-[var(--text-muted)]">The supplier is notified and asked to propose a new date for the corrective work.</p>
          <select autoFocus className={input} value={reason} onChange={e => { setReason(e.target.value); setErr('') }}>
            <option value="">— Choose a reason —</option>
            {SNAG_SCHEDULE_DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {reason === 'Other' && <textarea className={`${input} min-h-[80px]`} placeholder="Tell the supplier why…" value={other} onChange={e => setOther(e.target.value)} />}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={decline} disabled={busy} className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Declining…' : 'Decline schedule'}</button>
            <button onClick={() => { setDeclineOpen(false); setErr('') }} disabled={busy} className="flex-1 py-2 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Cancel ticket (with reason) ─────────────────────────────────
const CANCEL_REASONS = ['Duplicate ticket', 'Issue resolved itself', 'Not a maintenance issue', 'Store closed', 'Logged in error', 'Other']
const MAX_CANCEL_NOTE = 500
export function CancelTicketCard({ ticketId, jobRef, defaultOpen = false, onClose, trigger }: { ticketId: string; jobRef?: string | null; defaultOpen?: boolean; onClose?: () => void; trigger?: (open: () => void) => ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [reason, setReason] = useState(CANCEL_REASONS[0])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const close = () => { setOpen(false); onClose?.() }

  async function cancel() {
    setBusy(true); setErr('')
    // Note is optional context appended to the required reason.
    const finalReason = [reason, note.trim()].filter(Boolean).join(' — ')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'reject', reason: finalReason }); close(); setBusy(false); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)]'
  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (!defaultOpen &&
        <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition">Cancel ticket</button>
      )}
      {open && (
        <Modal maxWidth="max-w-lg" onClose={() => { if (!busy) close() }} title={
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400"><AlertCircle size={18} /></span>
            <span className="text-lg font-bold text-[var(--text)]">Cancel ticket{jobRef ? ` ${jobRef}` : ''}?</span>
          </span>
        }>
          <div className="space-y-0.5 border-b border-[var(--border)] pb-3 text-sm text-[var(--text-muted)]">
            <p>This will close the ticket and notify the store manager.</p>
            <p>Any outstanding quote requests will be withdrawn.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Reason <span className="text-red-500">*</span></label>
            <select className={input} value={reason} onChange={e => setReason(e.target.value)}>{CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Additional note <span className="font-normal text-[var(--text-faint)]">(optional)</span></label>
            <div className="relative">
              <textarea maxLength={MAX_CANCEL_NOTE} className={`${input} min-h-[110px] pb-7`} placeholder="Explain why the ticket is being cancelled…" value={note} onChange={e => setNote(e.target.value.slice(0, MAX_CANCEL_NOTE))} />
              <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] tabular-nums text-[var(--text-faint)]">{note.length} / {MAX_CANCEL_NOTE}</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl bg-red-500/[0.07] ring-1 ring-red-500/30 px-3.5 py-3">
            <Info size={16} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
            <p className="text-sm text-[var(--text-muted)]"><span className="text-[var(--text)]">This action <span className="font-semibold text-red-600 dark:text-red-400">cannot be undone</span>.</span> If this ticket was created by mistake, consider creating a new ticket instead.</p>
          </div>

          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={close} disabled={busy} className="flex-1 py-2.5 rounded-xl ring-1 ring-[var(--border)] text-[var(--text)] text-sm font-medium transition hover:bg-[var(--hover)] disabled:opacity-50">Keep ticket</button>
            <button disabled={busy} onClick={cancel} className="flex flex-1 items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-50"><Trash2 size={16} /> {busy ? 'Cancelling…' : 'Cancel ticket'}</button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Final close-out — greyed until the supplier confirms no more VOs ─
export function CloseOutButton({ ticketId, voConfirmed }: { ticketId: string; voConfirmed: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function closeOut() {
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'close_out' }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <div className="space-y-1.5">
      {!voConfirmed && <p className="text-xs text-[var(--text-muted)]">Waiting for the supplier to confirm there are no further variation orders before you can close out.</p>}
      <button onClick={closeOut} disabled={busy || !voConfirmed} className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed">{busy ? 'Closing out…' : 'Final close-out'}</button>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  )
}

// ── Ask a declined supplier to submit a revised quote ───────────
export function ReQuoteButton({ ticketId, quoteId }: { ticketId: string; quoteId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  async function go() {
    setBusy(true); setErr('')
    try {
      await post(`/api/tickets/${ticketId}/quote-decision`, { action: 'requote', quoteId })
      setBusy(false); setSent(true)
      setTimeout(() => setSent(false), 4000)   // clear the confirmation after a moment
      router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <div>
      <button onClick={go} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition disabled:opacity-50">{busy ? 'Sending…' : 'Ask to re-quote'}</button>
      {sent && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Re-quote request sent to the supplier.</p>}
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  )
}
