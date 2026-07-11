'use client'

// RM Tickets tab — search, full status filters + distribution bar, collapsible
// store groups, and a slide-out store panel. Each row shows the latest quote
// milestone (requested → received → accepted) coloured to the status.
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Ticket, Search, ChevronDown, BarChart3, Store, PlusCircle } from 'lucide-react'
import type { RegionalTicketRow } from '@/lib/health/data'
import { Card } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { CategoryIcon, priorityBadgeClass, priorityLabel } from '@/components/client/ticketBadges'
import { Modal } from '@/components/ui/Modal'
import { DrawerHeader } from '@/components/exec/Drawer'
import { readCollapse, writeCollapse, readCollapseSet, writeCollapseSet } from '@/lib/collapse-state'
import { rmStatusMeta, formatDateTime, humanizeDuration, urgencyCountCls } from '@/lib/utils'

type Bucket = 'open' | 'quote_requested' | 'quoted' | 'approved' | 'scheduled' | 'in_progress' | 'awaiting_signoff' | 'completed' | 'cancelled'
// A ticket counts as "Open" only while it's still open/info-requested AND has no
// supplier on it — once an RM assigns a supplier it moves to "Quote requested".
function bucketOf(s: string, supplierAssigned = false): Bucket {
  if (s === 'open' || s === 'info_requested') return supplierAssigned ? 'quote_requested' : 'open'
  if (['assigned', 'quote_requested', 'assessment'].includes(s)) return 'quote_requested'
  if (['quoted', 'quote_revision', 'variation_review'].includes(s)) return 'quoted'
  if (s === 'accepted') return 'approved'
  if (['scheduled', 'vo_declined'].includes(s)) return 'scheduled'
  if (['in_progress', 'variation_accepted'].includes(s)) return 'in_progress'
  if (['submitted_for_signoff', 'evidence_requested', 'snag', 'snag_assigned', 'snag_resolved', 'approved_closeout', 'pending_sign_off', 'snag_in_progress'].includes(s)) return 'awaiting_signoff'
  if (s === 'completed') return 'completed'
  return 'cancelled'
}
const BUCKET_LABEL: Record<Bucket, string> = { open: 'New', quote_requested: 'Quote requested', quoted: 'Quoted', approved: 'Approved', scheduled: 'Job scheduled', in_progress: 'In progress', awaiting_signoff: 'Sign-off', completed: 'Completed', cancelled: 'Cancelled' }
const BUCKET_BAR: Record<Bucket, string> = { open: 'bg-blue-500', quote_requested: 'bg-cyan-500', quoted: 'bg-violet-500', approved: 'bg-teal-500', scheduled: 'bg-indigo-500', in_progress: 'bg-[#C6A35D]', awaiting_signoff: 'bg-orange-500', completed: 'bg-emerald-500', cancelled: 'bg-red-500' }
const BAR_ORDER: Bucket[] = ['open', 'quote_requested', 'quoted', 'approved', 'scheduled', 'in_progress', 'awaiting_signoff', 'completed']

// Urgency rank (handles classic low/medium/high/urgent and engine P1–P4).
const URGENCY: Record<string, number> = { urgent: 0, P1: 0, high: 1, P2: 1, medium: 2, P3: 2, low: 3, P4: 3 }
const urgency = (p: string) => URGENCY[p] ?? 5
const byDateThenUrgency = (a: RegionalTicketRow, b: RegionalTicketRow) =>
  (+new Date(b.createdAt) - +new Date(a.createdAt)) || (urgency(a.priority) - urgency(b.priority))

// Tint a store group's count badge by its most urgent active ticket (cancelled
// tickets don't count) — shared with the SM/supplier tabs via urgencyCountCls.
function groupCountCls(rows: RegionalTicketRow[]): string {
  const active = rows.filter(t => bucketOf(t.status, t.supplierAssigned) !== 'cancelled')
  return urgencyCountCls(active.map(t => t.priority))
}

// No "All" pill: a null filter means all tickets, and clicking an active pill
// deselects back to that default. Internal/Supplier breach + Overdue sit before
// Cancelled. A breach that has gone fully overdue drops out of the breach pills
// and shows only under Overdue.
type RmFilter = 'internal_breach' | 'supplier_breach' | 'overdue' | Bucket
// Pills styled like the SM Tickets tab: tinted when inactive, filled when selected.
const PILLS: { key: RmFilter; label: string; active: string; inactive: string }[] = [
  { key: 'open', label: 'New', active: 'bg-blue-500 text-white', inactive: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  { key: 'quote_requested', label: 'Quote requested', active: 'bg-cyan-500 text-white', inactive: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400' },
  { key: 'quoted', label: 'Quoted', active: 'bg-violet-500 text-white', inactive: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' },
  { key: 'approved', label: 'Approved', active: 'bg-teal-500 text-white', inactive: 'bg-teal-500/15 text-teal-700 dark:text-teal-400' },
  { key: 'scheduled', label: 'Job scheduled', active: 'bg-indigo-500 text-white', inactive: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400' },
  { key: 'in_progress', label: 'In progress', active: 'bg-[#C6A35D] text-[#0a0e17]', inactive: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D]' },
  { key: 'awaiting_signoff', label: 'Sign-off', active: 'bg-orange-500 text-white', inactive: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  { key: 'completed', label: 'Completed', active: 'bg-emerald-500 text-white', inactive: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  { key: 'internal_breach', label: 'Internal Breached', active: 'bg-red-600 text-white', inactive: 'bg-red-600/15 text-red-700 dark:text-red-400' },
  { key: 'supplier_breach', label: 'Supplier Breached', active: 'bg-orange-600 text-white', inactive: 'bg-orange-600/15 text-orange-700 dark:text-orange-400' },
  { key: 'overdue', label: 'Overdue', active: 'bg-red-500 text-white', inactive: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  { key: 'cancelled', label: 'Cancelled', active: 'bg-gray-500 text-white', inactive: 'bg-gray-500/15 text-gray-600 dark:text-gray-400' },
]

// Row form factor matches the store-manager Tickets tab: category icon + job ref
// + category/title + store on the left; priority + status badges, supplier line
// and the logged date on the right. RM statuses come from rmStatusMeta.
function TicketRow({ t }: { t: RegionalTicketRow }) {
  const sm = rmStatusMeta(t.status)
  const statusCls = t.disputed ? 'bg-red-500/15 text-red-700 dark:text-red-400' : t.infoAdded ? 'bg-teal-500/15 text-teal-700 dark:text-teal-400' : sm.cls
  const statusLabel = t.disputed ? 'Dispute' : t.infoAdded ? 'Info added' : sm.label
  return (
    <Link href={`/regional/tickets/${t.id}`} className="grid gap-3 border-b border-[var(--border)] px-2 py-3 last:border-0 transition hover:bg-[var(--hover)] sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <CategoryIcon category={t.category ?? t.title} priority={t.priority} className="h-11 w-11" iconSize={18} />
        <div className="min-w-0">
          {t.jobRef && <p className="text-[10px] font-mono text-[var(--text-faint)]">{t.jobRef}</p>}
          <p className="truncate text-sm font-bold text-[var(--text)]">{t.category || t.title}</p>
          <p className="truncate text-xs text-[var(--text-muted)]">{t.storeName}</p>
        </div>
      </div>
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          <span className={`inline-flex min-w-[92px] justify-center rounded-md px-2 py-1 text-[10px] font-bold ${priorityBadgeClass(t as never)}`}>{priorityLabel(t as never)}</span>
          <span className={`inline-flex min-w-[92px] justify-center rounded-md px-2 py-1 text-[10px] font-bold ${statusCls}`}>{statusLabel}</span>
        </div>
        <p className="text-xs text-[var(--text-muted)]">{t.supplierAssigned ? 'Supplier assigned' : 'No supplier assigned'}</p>
        <p className="text-[11px] text-[var(--text-faint)]">
          {formatDateTime(t.createdAt)}
          {/* eslint-disable-next-line react-hooks/purity -- cosmetic "overdue by" / breach readout, not hydration-critical */}
          {t.overdue ? <span className="ml-1.5 font-semibold text-red-600 dark:text-red-400">· Overdue by {humanizeDuration(Date.now() - new Date(t.dueAt).getTime())}</span>
            : t.breached ? <span className="ml-1.5 font-semibold text-amber-600 dark:text-amber-400">· ⚠ breached</span> : null}
        </p>
      </div>
    </Link>
  )
}

export function RegionalTickets({ tickets }: { tickets: RegionalTicketRow[] }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<RmFilter | null>(null)
  // Store groups start collapsed; the set tracks which the user has expanded.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [panelStore, setPanelStore] = useState<string | null>(null)

  // Open a store's panel directly when linked from the Stores tab (?store=Name),
  // or apply a filter deep-linked from a dashboard KPI (?filter=overdue|quoted…).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const s = params.get('store')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads window.location (client-only) after mount to apply deep-linked ?store=; cannot run during SSR render
    if (s) setPanelStore(s)
    const f = params.get('filter')
    if (f && PILLS.some(p => p.key === f)) setFilter(f as RmFilter)
  }, [])

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { open: 0, quote_requested: 0, quoted: 0, approved: 0, scheduled: 0, in_progress: 0, awaiting_signoff: 0, completed: 0, cancelled: 0 }
    for (const t of tickets) c[bucketOf(t.status, t.supplierAssigned)]++
    return c
  }, [tickets])
  const barTotal = BAR_ORDER.reduce((s, b) => s + counts[b], 0) || 1
  // A breach only counts here while it's NOT yet overdue — once overdue it moves
  // to the Overdue pill (so it isn't double-counted).
  const internalBreachCount = useMemo(() => tickets.filter(t => t.internalBreached && !t.overdue).length, [tickets])
  const supplierBreachCount = useMemo(() => tickets.filter(t => t.supplierBreached && !t.overdue).length, [tickets])
  const overdueCount = useMemo(() => tickets.filter(t => t.overdue).length, [tickets])

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return tickets.filter(t => {
      if (filter === 'internal_breach') { if (!(t.internalBreached && !t.overdue)) return false }
      else if (filter === 'supplier_breach') { if (!(t.supplierBreached && !t.overdue)) return false }
      else if (filter === 'overdue') { if (!t.overdue) return false }
      else if (filter !== null && bucketOf(t.status, t.supplierAssigned) !== filter) return false
      if (!terms.length) return true
      const hay = `${t.title} ${t.storeName} ${t.branchCode ?? ''} ${t.jobRef ?? ''} ${rmStatusMeta(t.status).label}`.toLowerCase()
      return terms.every(w => hay.includes(w))
    })
  }, [tickets, q, filter])

  // Under "All": breached tickets pin to the top, completed drop into the Archive,
  // and the rest group by store. Everything is ordered newest → most urgent.
  // "Breach" pinned at the top = a supplier/internal breach that hasn't gone fully
  // overdue yet (overdue ones live under the Overdue filter / in their store group).
  const isLiveBreach = (t: RegionalTicketRow) => (t.internalBreached || t.supplierBreached) && !t.overdue
  const breachedRows = useMemo(() => filter === null ? shown.filter(isLiveBreach).sort(byDateThenUrgency) : [], [shown, filter])
  const liveShown = useMemo(() => (filter === null ? shown.filter(t => !isLiveBreach(t) && bucketOf(t.status, t.supplierAssigned) !== 'completed') : shown).slice().sort(byDateThenUrgency), [shown, filter])
  const archived = useMemo(() => (filter === null ? shown.filter(t => bucketOf(t.status, t.supplierAssigned) === 'completed') : []).slice().sort(byDateThenUrgency), [shown, filter])
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [breachedOpen, setBreachedOpen] = useState(false)

  // Restore the expand/collapse state the user left (per-session; wiped on sign-in)
  // so navigating into a ticket and back keeps the lists exactly as they were.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restores persisted expand/collapse state from localStorage (client-only) after mount; cannot run during SSR render
    setExpanded(new Set(readCollapseSet('rm-tickets-expanded')))
    setBreachedOpen(readCollapse('rm-tickets-breached') ?? false)
    setArchiveOpen(readCollapse('rm-tickets-archive') ?? false)
  }, [])

  const groups = useMemo(() => {
    const m = new Map<string, { branchCode: string | null; rows: RegionalTicketRow[] }>()
    for (const t of liveShown) { const g = m.get(t.storeName) ?? { branchCode: t.branchCode, rows: [] }; g.rows.push(t); m.set(t.storeName, g) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [liveShown])

  const toggle = (s: string) => setExpanded(c => { const n = new Set(c); n.has(s) ? n.delete(s) : n.add(s); writeCollapseSet('rm-tickets-expanded', [...n]); return n })
  const toggleBreached = () => setBreachedOpen(o => { const v = !o; writeCollapse('rm-tickets-breached', v); return v })
  const toggleArchive = () => setArchiveOpen(o => { const v = !o; writeCollapse('rm-tickets-archive', v); return v })
  const panelRows = useMemo(() => panelStore ? tickets.filter(t => t.storeName === panelStore) : [], [tickets, panelStore])

  // Arriving from a dashboard KPI auto-expands the live lists so the tickets are
  // visible immediately — runs once for the deep-link (not manual pill clicks).
  // Two entry points: a filtered KPI (?filter=…) or the umbrella "Open Tickets"
  // card (?expand=1, no filter = all live work). The expanded state is persisted.
  const didAutoExpand = useRef(false)
  useEffect(() => {
    if (didAutoExpand.current) return
    const params = new URLSearchParams(window.location.search)
    if (!params.get('filter') && !params.get('expand')) return
    didAutoExpand.current = true
    const names = groups.map(([s]) => s)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot auto-expand driven by a client-only URL query param (?filter/?expand); cannot run during SSR render
    setExpanded(new Set(names)); writeCollapseSet('rm-tickets-expanded', names)
    setBreachedOpen(true); writeCollapse('rm-tickets-breached', true)
    // The Archive (completed) stays collapsed on a KPI deep-link — only the live
    // lists open, so the tickets the KPI points at are what's visible.
  }, [filter, groups])

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Ticket className="text-blue-600 dark:text-blue-400" size={22} /> Tickets</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Grouped by store. Tap a store for an overview.</p>
        </div>
        <Link href="/regional/tickets/new" className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition shrink-0"><PlusCircle size={16} /> Log a Ticket</Link>
      </div>

      {/* Distribution bar (excludes cancelled) */}
      <Card className="p-4 space-y-2">
        <div className="h-3 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden flex">
          {BAR_ORDER.map(b => counts[b] > 0 && <div key={b} className={`h-full ${BUCKET_BAR[b]}`} style={{ width: `${Math.round((counts[b] / barTotal) * 100)}%` }} />)}
        </div>
      </Card>

      {/* Filter pills — above the search. Click an active pill to deselect (= all). */}
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {PILLS.map(p => {
          const n = p.key === 'internal_breach' ? internalBreachCount : p.key === 'supplier_breach' ? supplierBreachCount : p.key === 'overdue' ? overdueCount : counts[p.key as Bucket]
          const on = filter === p.key
          return (
            <button key={p.key} onClick={() => setFilter(f => f === p.key ? null : p.key)} aria-pressed={on} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition text-center ${on ? p.active : p.inactive}`}>
              {p.label} <span className="opacity-70">{n}</span>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tickets…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] outline-none focus:ring-[#C6A35D]/40" />
      </div>

      {/* SLA breached — pinned at the top when no filter is active, collapsible */}
      {filter === null && breachedRows.length > 0 && (
        <Card className="p-3 ring-1 ring-red-500/40 cursor-pointer hover:ring-red-500/60 transition" onClick={toggleBreached} role="button" tabIndex={0} aria-expanded={breachedOpen} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBreached() } }}>
          <div className="w-full flex items-center gap-2">
            <ChevronDown size={16} className={`shrink-0 text-red-500 transition-transform ${breachedOpen ? 'rotate-180' : ''}`} />
            <span className="text-sm font-bold text-red-600 dark:text-red-400">SLA Breached</span>
            <span className="text-[11px] font-medium text-red-700 dark:text-red-400 bg-red-500/15 rounded-full px-2 py-0.5">{breachedRows.length}</span>
          </div>
          {breachedOpen && <div className="px-1 mt-1" onClick={e => e.stopPropagation()}>{breachedRows.map(t => <TicketRow key={t.id} t={t} />)}</div>}
        </Card>
      )}

      {/* Store groups */}
      {groups.map(([store, g]) => {
        const isCollapsed = !expanded.has(store)
        return (
          <Card key={store} className="p-3 cursor-pointer hover:ring-[#C6A35D]/30 transition" onClick={() => toggle(store)} role="button" tabIndex={0} aria-expanded={!isCollapsed} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(store) } }}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="flex items-center gap-2 min-w-0">
                <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
                <span className="text-sm font-bold text-[var(--text)] truncate">{store}{g.branchCode ? ` · ${g.branchCode}` : ''}</span>
                <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 shrink-0 ${groupCountCls(g.rows)}`}>{g.rows.length}</span>
              </span>
              <button onClick={e => { e.stopPropagation(); setPanelStore(store) }} title="Store overview" className="shrink-0 -m-1 p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[#C6A35D] hover:bg-[#C6A35D]/10 transition"><BarChart3 size={16} /></button>
            </div>
            {!isCollapsed && <div className="px-1" onClick={e => e.stopPropagation()}>{g.rows.map(t => <TicketRow key={t.id} t={t} />)}</div>}
          </Card>
        )
      })}
      {!groups.length && !archived.length && !breachedRows.length && <Card className="p-5"><p className="text-sm text-[var(--text-faint)] text-center">No tickets match.</p></Card>}

      {/* Archive — completed tickets, only under the All filter */}
      {archived.length > 0 && (
        <Card className="p-3 cursor-pointer hover:ring-[#C6A35D]/30 transition" onClick={toggleArchive} role="button" tabIndex={0} aria-expanded={archiveOpen} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleArchive() } }}>
          <div className="w-full flex items-center gap-2">
            <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${archiveOpen ? 'rotate-180' : ''}`} />
            <span className="text-sm font-bold text-[var(--text)]">Archive · Completed</span>
            <span className="text-[11px] font-medium text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5">{archived.length}</span>
          </div>
          {archiveOpen && (
            <div className="px-1" onClick={e => e.stopPropagation()}>
              {archived.map(t => {
                const sm = rmStatusMeta(t.status)
                return (
                  <Link key={t.id} href={`/regional/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2.5 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--text)] truncate">{t.title}</p>
                      <p className="text-[11px] text-[var(--text-faint)] truncate">{t.storeName} · {formatDateTime(t.createdAt)}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_7rem] gap-1.5 shrink-0 justify-items-end sm:justify-items-stretch">
                      <PriorityBadge priority={t.priority} className="w-full text-center" />
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${sm.cls}`}>{sm.label}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {panelStore && <StorePanel store={panelStore} rows={panelRows} onClose={() => setPanelStore(null)} />}
    </div>
  )
}

function StorePanel({ store, rows, onClose }: { store: string; rows: RegionalTicketRow[]; onClose: () => void }) {
  const c: Record<Bucket, number> = { open: 0, quote_requested: 0, quoted: 0, approved: 0, scheduled: 0, in_progress: 0, awaiting_signoff: 0, completed: 0, cancelled: 0 }
  for (const t of rows) c[bucketOf(t.status, t.supplierAssigned)]++
  const total = rows.length
  const barTotal = BAR_ORDER.reduce((s, b) => s + c[b], 0) || 1
  const breached = rows.filter(t => t.breached).length
  const active = rows.filter(t => { const b = bucketOf(t.status, t.supplierAssigned); return b !== 'completed' && b !== 'cancelled' })
  // eslint-disable-next-line react-hooks/purity -- Date.now() computes an "oldest open (days)" stat for display only; cosmetic age readout, not a hydration-correctness concern
  const oldest = active.length ? Math.max(...active.map(t => Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86_400_000))) : 0

  const Stat = ({ label, value, tone = '' }: { label: string; value: number | string; tone?: string }) => (
    <div className="rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-3">
      <div className={`text-xl font-bold ${tone || 'text-[var(--text)]'}`}>{value}</div>
      <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
    </div>
  )

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      {close => (
        <>
        <DrawerHeader onClose={close} title={
          <div className="flex items-center gap-2 flex-wrap">
            <Store size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <h3 className="text-lg font-bold text-[var(--text)]">{store}</h3>
            <span className="text-xs text-[var(--text-muted)]">{total} ticket{total === 1 ? '' : 's'}</span>
          </div>
        } />

        <div className="space-y-2">
          <div className="h-3 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden flex">
            {BAR_ORDER.map(b => c[b] > 0 && <div key={b} className={`h-full ${BUCKET_BAR[b]}`} style={{ width: `${Math.round((c[b] / barTotal) * 100)}%` }} />)}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {([...BAR_ORDER, 'cancelled'] as Bucket[]).map(b => c[b] > 0 && (
              <span key={b} className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className={`w-2 h-2 rounded-full ${BUCKET_BAR[b]}`} />{BUCKET_LABEL[b]} {c[b]}</span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Total" value={total} />
          <Stat label="Breached" value={breached} tone={breached ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'} />
          <Stat label="Open / Quoting" value={c.open + c.quote_requested + c.quoted} />
          <Stat label="In progress" value={c.approved + c.scheduled + c.in_progress + c.awaiting_signoff} />
          <Stat label="Completed" value={c.completed} />
          <Stat label="Oldest open" value={`${oldest}d`} tone={oldest >= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--text)]'} />
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Tickets</div>
          {rows.map(t => <TicketRow key={t.id} t={t} />)}
        </div>
        </>
      )}
    </Modal>
  )
}
