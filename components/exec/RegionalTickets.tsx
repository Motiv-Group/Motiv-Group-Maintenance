'use client'

// RM Tickets tab — stat cards (My actions / Awaiting action / At SLA breach and
// overdue / Completed and closed), a dropdown filter bar (search · status ·
// priority · store · sort · advanced), and store-grouped cards that expand into a
// table (Ticket ID · Category · Status · Priority · Next action · SLA status ·
// Updated). Store overview panel, completed archive, dashboard deep-links and
// remembered expand state are all preserved.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Ticket, ChevronDown, ChevronRight, BarChart3, Store, PlusCircle, User, AlertTriangle, CheckCircle2, Clock, SlidersHorizontal, X } from 'lucide-react'
import type { RegionalTicketRow } from '@/lib/health/data'
import { Card, FilterSelect, SearchInput } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { priorityBadgeClass, priorityLabel } from '@/components/client/ticketBadges'
import { Modal } from '@/components/ui/Modal'
import { DrawerHeader } from '@/components/exec/Drawer'
import { readCollapse, writeCollapse, readCollapseSet, writeCollapseSet } from '@/lib/collapse-state'
import { rmStatusMeta, formatDateTime, humanizeDuration } from '@/lib/utils'

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
const BUCKET_BAR: Record<Bucket, string> = { open: 'bg-blue-500', quote_requested: 'bg-blue-500', quoted: 'bg-amber-500', approved: 'bg-blue-500', scheduled: 'bg-blue-500', in_progress: 'bg-blue-500', awaiting_signoff: 'bg-amber-500', completed: 'bg-emerald-500', cancelled: 'bg-gray-500' }
const BAR_ORDER: Bucket[] = ['open', 'quote_requested', 'quoted', 'approved', 'scheduled', 'in_progress', 'awaiting_signoff', 'completed']
// Status dropdown options (specific buckets between the broad "active" / "all").
const STATUS_BUCKETS: Bucket[] = ['open', 'quote_requested', 'quoted', 'approved', 'scheduled', 'in_progress', 'awaiting_signoff']

// Urgency rank (handles classic low/medium/high/urgent and engine P1–P4).
const URGENCY: Record<string, number> = { urgent: 0, P1: 0, high: 1, P2: 1, medium: 2, P3: 2, low: 3, P4: 3 }
const urgency = (p: string) => URGENCY[p] ?? 5
// Left-border + icon accent for a store, keyed to its most-urgent ticket.
const ACCENT: { border: string; icon: string }[] = [
  { border: 'border-red-500', icon: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  { border: 'border-orange-500', icon: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
  { border: 'border-amber-500', icon: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  { border: 'border-slate-500', icon: 'bg-slate-500/15 text-slate-500 dark:text-slate-300' },
]
const accentOf = (rank: number) => ACCENT[Math.min(3, Math.max(0, rank))]

const isDone = (t: RegionalTicketRow) => { const b = bucketOf(t.status, t.supplierAssigned); return b === 'completed' || b === 'cancelled' }
const isCritical = (t: RegionalTicketRow) => t.overdue || t.internalBreached || t.supplierBreached

// Row comparators, hoisted so the sort selection is a plain lookup (keeps the
// React Compiler happy — no memoized closures).
type Cmp = (a: RegionalTicketRow, b: RegionalTicketRow) => number
const cmpNew: Cmp = (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
const SORTERS: Record<'urgent' | 'newest' | 'oldest' | 'sla', Cmp> = {
  newest: cmpNew,
  oldest: (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
  sla: (a, b) => (+new Date(a.slaDueAt ?? a.dueAt) - +new Date(b.slaDueAt ?? b.dueAt)) || cmpNew(a, b),
  urgent: (a, b) => (urgency(a.priority) - urgency(b.priority)) || cmpNew(a, b),
}

// Valid deep-link (?filter=) keys — bucket keys plus the breach/overdue slices.
const RM_FILTER_KEYS = new Set<string>([...STATUS_BUCKETS, 'completed', 'cancelled', 'internal_breach', 'supplier_breach', 'overdue'])

// What the RM should do next on this ticket. `act` marks the states where the RM
// themselves must do something (drives the "My actions" count + emphasis).
function rmRowAction(t: RegionalTicketRow): { text: string; act: boolean } {
  if (t.disputed) return { text: 'Resolve the dispute', act: true }
  switch (t.status) {
    case 'open':
    case 'info_requested': return t.supplierAssigned ? { text: 'Awaiting supplier quote', act: false } : { text: 'Assign a supplier', act: true }
    case 'suppliers_declined': return { text: 'Re-assign a supplier', act: true }
    case 'assigned':
    case 'quote_requested':
    case 'assessment': return { text: 'Awaiting supplier quote', act: false }
    case 'quoted':
    case 'quote_revision': return { text: 'Review quotes', act: true }
    case 'variation_review': return { text: 'Review variation order', act: true }
    case 'accepted': return { text: 'Awaiting scheduling', act: false }
    case 'scheduled': return { text: 'Job scheduled', act: false }
    case 'in_progress': return { text: 'Work in progress', act: false }
    case 'submitted_for_signoff':
    case 'pending_sign_off':
    case 'snag_resolved': return { text: 'Sign off completion', act: true }
    case 'evidence_requested': return { text: 'Awaiting evidence', act: false }
    case 'snag':
    case 'snag_assigned':
    case 'snag_in_progress': return { text: 'Snag in progress', act: false }
    case 'approved_closeout': return { text: 'Finalise close-out', act: true }
    case 'completed': return { text: 'Completed', act: false }
    case 'cancelled':
    case 'declined': return { text: 'Closed', act: false }
    default: return { text: 'Track progress', act: false }
  }
}

// SLA status pill for a row: Overdue (amber) · Breached (red) · Due in … (blue).
function slaStatus(t: RegionalTicketRow, nowMs: number): { label: string; cls: string; Icon: typeof Clock } {
  if (t.overdue) return { label: 'Overdue', cls: 'text-amber-600 dark:text-amber-400', Icon: Clock }
  if (t.breached) return { label: 'Breached', cls: 'text-red-600 dark:text-red-400', Icon: AlertTriangle }
  const due = +new Date(t.slaDueAt ?? t.dueAt)
  if (Number.isFinite(due) && due > nowMs) return { label: `Due in ${humanizeDuration(due - nowMs)}`, cls: 'text-blue-600 dark:text-blue-400', Icon: Clock }
  return { label: '—', cls: 'text-[var(--text-faint)]', Icon: Clock }
}

// ── Stat card (KPI + quick filter) ──────────────────────────────
type Intent = 'mine' | 'awaiting' | 'critical' | 'done'
const INTENT_TONE: Record<Intent, { icon: string; ring: string }> = {
  mine: { icon: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', ring: 'ring-amber-500' },
  awaiting: { icon: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', ring: 'ring-blue-500' },
  critical: { icon: 'bg-red-500/15 text-red-600 dark:text-red-400', ring: 'ring-red-500' },
  done: { icon: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500' },
}
function StatCard({ intent, icon, value, title, sub, active, onClick }: { intent: Intent; icon: ReactNode; value: number; title: string; sub: string; active: boolean; onClick: () => void }) {
  const tone = INTENT_TONE[intent]
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`flex items-center gap-2.5 rounded-xl bg-[var(--surface)] p-3 text-left ring-1 transition hover:bg-[var(--hover)] sm:gap-3 sm:p-4 ${active ? `ring-2 ${tone.ring}` : 'ring-[var(--border)]'}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-11 sm:w-11 ${tone.icon}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-xl font-bold leading-none text-[var(--text)] sm:text-2xl">{value}</span>
        <span className="mt-1 block text-xs font-semibold text-[var(--text)] sm:text-sm">{title}</span>
        <span className="hidden text-[11px] text-[var(--text-muted)] sm:block">{sub}</span>
      </span>
    </button>
  )
}

// ── One store's expanded ticket table ───────────────────────────
const COLS = 'grid-cols-[1.3fr_1fr_1fr_0.8fr_1.5fr_1.1fr_1.2fr_0.3fr]'
function TicketTable({ rows, nowMs }: { rows: RegionalTicketRow[]; nowMs: number }) {
  return (
    <>
    {/* Mobile: stacked cards — the 8-column grid below needs 920px and would force
        the phone to pan sideways. Same fields, three compact lines, whole row taps. */}
    <div className="sm:hidden">
      {rows.map(t => {
        const action = rmRowAction(t)
        const sm = rmStatusMeta(t.status)
        const statusCls = t.disputed ? 'bg-red-500/15 text-red-700 dark:text-red-400' : t.infoAdded ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : sm.cls
        const statusLabel = t.disputed ? 'Dispute' : t.infoAdded ? 'Info added' : sm.label
        const sla = slaStatus(t, nowMs)
        return (
          <Link key={t.id} href={`/regional/tickets/${t.id}`} className="flex flex-col gap-1 border-b border-[var(--border)] px-3 py-3 transition last:border-0 hover:bg-[var(--hover)]">
            <span className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold text-[var(--text)]">{t.jobRef ?? '—'}</span>
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${priorityBadgeClass(t as never)}`}>{priorityLabel(t as never)}</span>
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${statusCls}`}>{statusLabel}</span>
            </span>
            <span className={`text-sm leading-snug ${action.act ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
              <span className="text-[var(--text-muted)] font-normal">{t.category || t.title} · </span>{action.text}
            </span>
            <span className="flex items-center justify-between gap-2 text-xs">
              <span className={`flex min-w-0 items-center gap-1 font-medium ${sla.cls}`}><sla.Icon size={13} className="shrink-0" /> <span className="truncate">{sla.label}</span></span>
              <span className="shrink-0 text-[var(--text-faint)]">{formatDateTime(t.createdAt)}</span>
            </span>
          </Link>
        )
      })}
    </div>
    {/* Desktop: the full 8-column grid, unchanged. */}
    <div className="hidden overflow-x-auto sm:block">
      <div className="min-w-[920px]">
        <div className={`grid ${COLS} gap-3 border-b border-[var(--border)] px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]`}>
          <span>Ticket ID</span><span>Category</span><span>Status</span><span>Priority</span><span>Next action</span><span>SLA status</span><span>Updated</span><span />
        </div>
        {rows.map(t => {
          const action = rmRowAction(t)
          const sm = rmStatusMeta(t.status)
          const statusCls = t.disputed ? 'bg-red-500/15 text-red-700 dark:text-red-400' : t.infoAdded ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : sm.cls
          const statusLabel = t.disputed ? 'Dispute' : t.infoAdded ? 'Info added' : sm.label
          const sla = slaStatus(t, nowMs)
          return (
            <Link key={t.id} href={`/regional/tickets/${t.id}`} className={`grid ${COLS} items-center gap-3 border-b border-[var(--border)] px-2 py-3 text-sm transition last:border-0 hover:bg-[var(--hover)]`}>
              <span className="truncate font-mono text-[13px] text-[var(--text)]">{t.jobRef ?? '—'}</span>
              <span className="truncate text-[var(--text-muted)]">{t.category || t.title}</span>
              <span><span className={`inline-flex w-full max-w-[112px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${statusCls}`}>{statusLabel}</span></span>
              <span><span className={`inline-flex w-full max-w-[78px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${priorityBadgeClass(t as never)}`}>{priorityLabel(t as never)}</span></span>
              <span className={`truncate ${action.act ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>{action.text}</span>
              <span className={`flex items-center gap-1.5 font-medium ${sla.cls}`}><sla.Icon size={14} className="shrink-0" /> <span className="truncate">{sla.label}</span></span>
              <span className="truncate text-[var(--text-muted)]">{formatDateTime(t.createdAt)}</span>
              <ChevronRight size={16} className="justify-self-end text-[var(--text-faint)]" />
            </Link>
          )
        })}
      </div>
    </div>
    </>
  )
}

export function RegionalTickets({ tickets }: { tickets: RegionalTicketRow[] }) {
  const [q, setQ] = useState('')
  const [intent, setIntent] = useState<Intent | null>(null)
  const [status, setStatus] = useState<'active' | 'all' | 'completed' | Bucket>('all')
  const [priority, setPriority] = useState<'all' | '0' | '1' | '2' | '3'>('all')
  const [store, setStore] = useState<string>('all')
  const [sort, setSort] = useState<'urgent' | 'newest' | 'oldest' | 'sla'>('urgent')
  const [adv, setAdv] = useState<Set<string>>(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [panelStore, setPanelStore] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)

  // Deep-links from the Stores tab (?store=Name) / dashboard KPIs (?filter=…).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const s = params.get('store')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads window.location (client-only) after mount to apply deep-links; cannot run during SSR render
    if (s) setStore(s)
    const f = params.get('filter')
    if (f && RM_FILTER_KEYS.has(f)) {
      if (f === 'overdue' || f === 'internal_breach' || f === 'supplier_breach') setAdv(new Set([f]))
      else if (f === 'completed' || f === 'cancelled') setStatus(f as Bucket)
      else setStatus(f as Bucket)
    }
  }, [])

  // Restore remembered expand/collapse state (per session; wiped on sign-in).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restores persisted state from localStorage (client-only) after mount; cannot run during SSR render
    setExpanded(new Set(readCollapseSet('rm-tickets-expanded')))
    setArchiveOpen(readCollapse('rm-tickets-archive') ?? false)
  }, [])

  const storeNames = useMemo(() => [...new Set(tickets.map(t => t.storeName))].sort((a, b) => a.localeCompare(b)), [tickets])

  const stats = useMemo(() => {
    let mine = 0, awaiting = 0, critical = 0, done = 0
    for (const t of tickets) {
      if (isDone(t)) { done++; continue }
      if (isCritical(t)) critical++
      if (rmRowAction(t).act) mine++; else awaiting++
    }
    return { mine, awaiting, critical, done }
  }, [tickets])

  const terms = useMemo(() => q.toLowerCase().split(/\s+/).filter(Boolean), [q])
  // Filters that apply regardless of the status/intent scope (search · priority ·
  // store · advanced) — reused to build the archive under the default view.
  const base = useMemo(() => (t: RegionalTicketRow) => {
    if (priority !== 'all' && urgency(t.priority) !== Number(priority)) return false
    if (store !== 'all' && t.storeName !== store) return false
    if (adv.size) {
      if (adv.has('overdue') && !t.overdue) return false
      if (adv.has('internal_breach') && !(t.internalBreached && !t.overdue)) return false
      if (adv.has('supplier_breach') && !(t.supplierBreached && !t.overdue)) return false
      if (adv.has('disputed') && !t.disputed) return false
    }
    if (terms.length) {
      const hay = `${t.title} ${t.category ?? ''} ${t.storeName} ${t.branchCode ?? ''} ${t.jobRef ?? ''} ${rmStatusMeta(t.status).label}`.toLowerCase()
      if (!terms.every(w => hay.includes(w))) return false
    }
    return true
  }, [priority, store, adv, terms])

  const pass = useMemo(() => (t: RegionalTicketRow) => {
    if (!base(t)) return false
    const done = isDone(t)
    if (intent === 'mine') return !done && rmRowAction(t).act
    if (intent === 'awaiting') return !done && !rmRowAction(t).act
    if (intent === 'critical') return isCritical(t)
    if (intent === 'done') return done
    // no intent → status dropdown drives the scope
    if (status === 'all') return true
    if (status === 'completed') return done
    if (status === 'active') return !done
    return bucketOf(t.status, t.supplierAssigned) === status
  }, [base, intent, status])

  const sorter = SORTERS[sort]

  const shown = useMemo(() => tickets.filter(pass).sort(sorter), [tickets, pass, sorter])
  const isDefault = intent === null && status === 'active'
  const archived = useMemo(() => isDefault ? tickets.filter(t => base(t) && isDone(t)).sort(sorter) : [], [tickets, base, sorter, isDefault])

  // Group by store, ordered by soonest upcoming SLA (most urgent store first).
  const groups = useMemo(() => {
    const m = new Map<string, { branchCode: string | null; rows: RegionalTicketRow[] }>()
    for (const t of shown) { const g = m.get(t.storeName) ?? { branchCode: t.branchCode, rows: [] }; g.rows.push(t); m.set(t.storeName, g) }
    // eslint-disable-next-line react-hooks/purity -- cosmetic ordering by "next SLA" countdown; not hydration-critical
    const nowMs = Date.now()
    const nextSlaOf = (rows: RegionalTicketRow[]) => {
      const up = rows.map(t => +new Date(t.slaDueAt ?? t.dueAt)).filter(ms => ms > nowMs)
      return up.length ? Math.min(...up) : Infinity
    }
    return [...m.entries()].sort((a, b) => nextSlaOf(a[1].rows) - nextSlaOf(b[1].rows) || a[0].localeCompare(b[0]))
  }, [shown])

  const toggle = (s: string) => setExpanded(c => { const n = new Set(c); n.has(s) ? n.delete(s) : n.add(s); writeCollapseSet('rm-tickets-expanded', [...n]); return n })
  const toggleArchive = () => setArchiveOpen(o => { const v = !o; writeCollapse('rm-tickets-archive', v); return v })
  const panelRows = useMemo(() => panelStore ? tickets.filter(t => t.storeName === panelStore) : [], [tickets, panelStore])
  const pickIntent = (i: Intent) => { setIntent(cur => cur === i ? null : i); setStatus('active') }
  const clearFilters = () => { setIntent(null); setStatus('active'); setPriority('all'); setStore('all'); setAdv(new Set()); setQ(''); setFiltersOpen(false) }

  // Arriving from a dashboard KPI auto-expands the store groups so the tickets are
  // visible immediately (runs once for the deep-link, not manual interaction).
  const didAutoExpand = useRef(false)
  useEffect(() => {
    if (didAutoExpand.current) return
    const params = new URLSearchParams(window.location.search)
    if (!params.get('filter') && !params.get('expand')) return
    didAutoExpand.current = true
    const names = groups.map(([s]) => s)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot auto-expand driven by a client-only URL query param; cannot run during SSR render
    setExpanded(new Set(names)); writeCollapseSet('rm-tickets-expanded', names)
  }, [groups])

  const statusOptions: { value: 'active' | 'all' | 'completed' | Bucket; label: string }[] = [
    { value: 'active', label: 'Open' }, { value: 'all', label: 'All' },
    ...STATUS_BUCKETS.map(b => ({ value: b, label: BUCKET_LABEL[b] })),
    { value: 'completed', label: 'Completed' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]"><Ticket className="text-blue-600 dark:text-blue-400" size={22} /> Tickets</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">Manage and track tickets across all stores.</p>
        </div>
        <Link href="/regional/tickets/new" className="flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"><PlusCircle size={16} /> Log a Ticket</Link>
      </div>

      {/* Stat cards (click to filter) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
        <StatCard intent="mine" icon={<User size={20} />} value={stats.mine} title="My actions" sub="Require your response" active={intent === 'mine'} onClick={() => pickIntent('mine')} />
        <StatCard intent="awaiting" icon={<Ticket size={20} />} value={stats.awaiting} title="Awaiting action" sub="From others" active={intent === 'awaiting'} onClick={() => pickIntent('awaiting')} />
        <StatCard intent="critical" icon={<AlertTriangle size={20} />} value={stats.critical} title="At SLA breach and overdue" sub="Require attention" active={intent === 'critical'} onClick={() => pickIntent('critical')} />
        <StatCard intent="done" icon={<CheckCircle2 size={20} />} value={stats.done} title="Completed and closed" sub="All resolved" active={intent === 'done'} onClick={() => pickIntent('done')} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search tickets…" />
        {/* Mobile: pills form one horizontally-swipeable strip (sm:contents dissolves
            the wrapper so desktop keeps the exact flex-wrap layout). */}
        <div className="flex w-full flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 sm:contents">
        <FilterSelect label="Status" value={status} onChange={v => { setStatus(v); setIntent(null) }} options={statusOptions} />
        <FilterSelect label="Priority" value={priority} onChange={setPriority} options={[{ value: 'all', label: 'All' }, { value: '0', label: 'Critical' }, { value: '1', label: 'High' }, { value: '2', label: 'Medium' }, { value: '3', label: 'Low' }]} />
        <FilterSelect label="Store" value={store} onChange={setStore} options={[{ value: 'all', label: 'All stores' }, ...storeNames.map(s => ({ value: s, label: s }))]} />
        <FilterSelect label="Sort by" value={sort} onChange={setSort} options={[{ value: 'urgent', label: 'Most urgent' }, { value: 'sla', label: 'Next SLA' }, { value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }]} />
        </div>
        {/* Outside the strip: its overflow-x-auto would clip this absolute dropdown. */}
        <div className="relative">
          <button type="button" onClick={() => setFiltersOpen(o => !o)} aria-expanded={filtersOpen}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold ring-1 transition ${adv.size ? 'bg-blue-500/10 text-blue-500 ring-blue-500/40' : 'text-[var(--text-muted)] ring-[var(--border)] hover:bg-[var(--hover)]'}`}>
            <SlidersHorizontal size={15} /> Filters{adv.size ? ` (${adv.size})` : ''}
          </button>
          {filtersOpen && (
            <>
              <button aria-hidden tabIndex={-1} onClick={() => setFiltersOpen(false)} className="fixed inset-0 z-10 cursor-default" />
              <div className="absolute left-0 z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl bg-[var(--surface-2)] p-2 ring-1 ring-[var(--border)] shadow-lg shadow-black/20 sm:left-auto sm:right-0">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Refine</p>
                {([['overdue', 'Overdue'], ['internal_breach', 'Internal breached'], ['supplier_breach', 'Supplier breached'], ['disputed', 'Disputed']] as const).map(([k, label]) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-[var(--text)] transition hover:bg-[var(--hover)]">
                    <input type="checkbox" checked={adv.has(k)} onChange={e => setAdv(s => { const n = new Set(s); e.target.checked ? n.add(k) : n.delete(k); return n })} className="h-4 w-4 accent-[#f59e0b]" />
                    {label}
                  </label>
                ))}
                <button type="button" onClick={clearFilters} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]"><X size={14} /> Clear all filters</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Store groups */}
      {groups.map(([storeName, g]) => {
        const isCollapsed = !expanded.has(storeName)
        // eslint-disable-next-line react-hooks/purity -- cosmetic "next SLA in" countdown, recomputed per render by design
        const nowMs = Date.now()
        const active = g.rows.filter(t => !isDone(t))
        const openN = active.length
        const critical = active.filter(t => ['P1', 'urgent'].includes(String(t.priority))).length
        const overdue = active.filter(t => t.overdue).length
        const topRank = active.length ? Math.min(...active.map(t => urgency(t.priority))) : 3
        const accent = accentOf(topRank)
        const up = active.map(t => +new Date(t.slaDueAt ?? t.dueAt)).filter(ms => ms > nowMs)
        const nextSla = up.length ? Math.min(...up) : null
        return (
          <div key={storeName} className="overflow-hidden rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)]">
            <div role="button" tabIndex={0} aria-expanded={!isCollapsed} onClick={() => toggle(storeName)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(storeName) } }}
              className="flex cursor-pointer items-center gap-3 p-4 transition hover:bg-[var(--hover)]">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full sm:h-11 sm:w-11 ${accent.icon}`}><Store size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 line-clamp-2 break-words text-base font-bold text-[var(--text)] sm:line-clamp-none sm:truncate">{storeName}</span>
                  {g.branchCode && <span className="shrink-0 text-sm text-[var(--text-muted)]">· {g.branchCode}</span>}
                </span>
                <span className="mt-0.5 block text-sm text-[var(--text-muted)]">
                  {openN} open
                  {critical > 0 && <> · <span className="font-semibold text-red-600 dark:text-red-400">{critical} critical</span></>}
                  {overdue > 0 && <> · <span className="font-semibold text-amber-600 dark:text-amber-400">{overdue} overdue</span></>}
                  {/* Mobile folds the next-SLA countdown in here (right-hand block is sm+). */}
                  {nextSla != null && <span className="sm:hidden"> · SLA {humanizeDuration(nextSla - nowMs)}</span>}
                </span>
              </span>
              <button type="button" onClick={e => { e.stopPropagation(); setPanelStore(storeName) }} title="Store overview" className="shrink-0 rounded-lg p-2.5 -m-1 text-[var(--text-faint)] transition hover:bg-blue-500/10 hover:text-blue-500 sm:p-1.5 sm:m-0"><BarChart3 size={16} /></button>
              <span className="hidden shrink-0 text-right sm:block">
                <span className="block text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Next SLA in</span>
                <span className={`block text-sm font-bold ${nextSla != null && nextSla - nowMs < 2 * 3600_000 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>{nextSla != null ? humanizeDuration(nextSla - nowMs) : '—'}</span>
              </span>
              <ChevronDown size={18} className={`shrink-0 text-[var(--text-muted)] transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
            </div>
            {!isCollapsed && <div className="border-t border-[var(--border)] px-2 pb-2"><TicketTable rows={g.rows} nowMs={nowMs} /></div>}
          </div>
        )
      })}
      {!groups.length && !archived.length && <Card className="p-5"><p className="text-center text-sm text-[var(--text-faint)]">No tickets match.</p></Card>}

      {/* Archive — completed tickets, only under the default view */}
      {archived.length > 0 && (
        <Card className="cursor-pointer p-3 transition hover:ring-blue-500/30" onClick={toggleArchive} role="button" tabIndex={0} aria-expanded={archiveOpen} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleArchive() } }}>
          <div className="flex w-full items-center gap-2">
            <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${archiveOpen ? 'rotate-180' : ''}`} />
            <span className="text-sm font-bold text-[var(--text)]">Archive · Completed</span>
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] dark:bg-white/10">{archived.length}</span>
          </div>
          {archiveOpen && (
            <div className="mt-1 px-1" onClick={e => e.stopPropagation()}>
              {archived.map(t => {
                const sm = rmStatusMeta(t.status)
                return (
                  <Link key={t.id} href={`/regional/tickets/${t.id}`} className="-mx-2 flex items-center justify-between gap-2 rounded-lg border-b border-[var(--border)] px-2 py-2.5 transition last:border-0 hover:bg-[var(--hover)]">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[var(--text)]">{t.title}</p>
                      <p className="truncate text-sm text-[var(--text-muted)]">{t.storeName} · {formatDateTime(t.createdAt)}</p>
                    </div>
                    <div className="grid shrink-0 grid-cols-1 justify-items-end gap-1.5 sm:grid-cols-[4.5rem_7rem] sm:justify-items-stretch">
                      <PriorityBadge priority={t.priority} className="w-full text-center" />
                      <span className={`w-full rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${sm.cls}`}>{sm.label}</span>
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
  // eslint-disable-next-line react-hooks/purity -- Date.now() computes an "oldest open (days)" stat for display only; cosmetic age readout
  const oldest = active.length ? Math.max(...active.map(t => Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86_400_000))) : 0
  // eslint-disable-next-line react-hooks/purity -- cosmetic SLA countdown for the store panel rows
  const nowMs = Date.now()

  const Stat = ({ label, value, tone = '' }: { label: string; value: number | string; tone?: string }) => (
    <div className="rounded-xl bg-[var(--surface)] p-3 ring-1 ring-[var(--border)]">
      <div className={`text-xl font-bold ${tone || 'text-[var(--text)]'}`}>{value}</div>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
    </div>
  )

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl">
      {close => (
        <>
          <DrawerHeader onClose={close} title={
            <div className="flex flex-wrap items-center gap-2">
              <Store size={18} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-lg font-bold text-[var(--text)]">{store}</h3>
              <span className="text-xs text-[var(--text-muted)]">{total} ticket{total === 1 ? '' : 's'}</span>
            </div>
          } />

          <div className="space-y-2">
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
              {BAR_ORDER.map(b => c[b] > 0 && <div key={b} className={`h-full ${BUCKET_BAR[b]}`} style={{ width: `${Math.round((c[b] / barTotal) * 100)}%` }} />)}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              {([...BAR_ORDER, 'cancelled'] as Bucket[]).map(b => c[b] > 0 && (
                <span key={b} className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className={`h-2 w-2 rounded-full ${BUCKET_BAR[b]}`} />{BUCKET_LABEL[b]} {c[b]}</span>
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
            <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Tickets</div>
            <TicketTable rows={rows} nowMs={nowMs} />
          </div>
        </>
      )}
    </Modal>
  )
}
