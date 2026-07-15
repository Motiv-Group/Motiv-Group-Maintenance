'use client'

// Shared Tickets-tab layout (RM / supplier / SM): four clickable stat cards
// (My actions · Awaiting action · At SLA breach and overdue · Completed and
// closed), a dropdown filter bar (search · status · priority · store · sort ·
// advanced), and either store-grouped cards that expand into a table, or a single
// flat table. Callers normalise their data into TabRow[] and pass display config;
// the store-overview button fires onStoreOverview so the caller can render its own
// (role-specific) panel.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Ticket, Search, ChevronDown, ChevronRight, BarChart3, Store, PlusCircle, User, AlertTriangle, CheckCircle2, Clock, SlidersHorizontal, X } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { readCollapse, writeCollapse, readCollapseSet, writeCollapseSet } from '@/lib/collapse-state'
import { formatDateTime, humanizeDuration } from '@/lib/utils'

export type Intent = 'mine' | 'awaiting' | 'critical' | 'done'

// One normalised ticket row — every role maps its own data onto this shape.
export interface TabRow {
  id: string
  href: string
  jobRef: string | null
  category: string
  storeName: string
  branchCode: string | null
  priority: string
  statusLabel: string
  statusCls: string
  nextAction: string
  nextActionAct: boolean
  intent: Intent
  bucket: string          // fine-grained status key, for the Status dropdown
  slaDueAt: string | null
  overdue: boolean
  breached: boolean
  createdAt: string
}

const URGENCY: Record<string, number> = { urgent: 0, P1: 0, high: 1, P2: 1, medium: 2, P3: 2, low: 3, P4: 3 }
const urgency = (p: string) => URGENCY[p] ?? 5
const priorityBadge = (p: string) =>
  urgency(p) === 0 ? 'bg-red-500/15 text-red-600 dark:text-red-400'
  : urgency(p) === 1 ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
  : urgency(p) === 2 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
const priorityText = (p: string) => urgency(p) === 0 ? 'Critical' : urgency(p) === 1 ? 'High' : urgency(p) === 2 ? 'Medium' : 'Low'
const ACCENT: { border: string; icon: string }[] = [
  { border: 'border-red-500', icon: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  { border: 'border-orange-500', icon: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
  { border: 'border-amber-500', icon: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  { border: 'border-slate-500', icon: 'bg-slate-500/15 text-slate-500 dark:text-slate-300' },
]
const accentOf = (rank: number) => ACCENT[Math.min(3, Math.max(0, rank))]

type Cmp = (a: TabRow, b: TabRow) => number
const cmpNew: Cmp = (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
const SORTERS: Record<'urgent' | 'newest' | 'oldest' | 'sla', Cmp> = {
  newest: cmpNew,
  oldest: (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
  sla: (a, b) => (+new Date(a.slaDueAt ?? a.createdAt) - +new Date(b.slaDueAt ?? b.createdAt)) || cmpNew(a, b),
  urgent: (a, b) => (urgency(a.priority) - urgency(b.priority)) || cmpNew(a, b),
}

function slaStatus(t: TabRow, nowMs: number): { label: string; cls: string; Icon: typeof Clock } {
  if (t.overdue) return { label: 'Overdue', cls: 'text-amber-600 dark:text-amber-400', Icon: Clock }
  if (t.breached) return { label: 'Breached', cls: 'text-red-600 dark:text-red-400', Icon: AlertTriangle }
  const due = t.slaDueAt ? +new Date(t.slaDueAt) : NaN
  if (Number.isFinite(due) && due > nowMs) return { label: `Due in ${humanizeDuration(due - nowMs)}`, cls: 'text-blue-600 dark:text-blue-400', Icon: Clock }
  return { label: '—', cls: 'text-[var(--text-faint)]', Icon: Clock }
}

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
      className={`flex items-center gap-3 rounded-xl bg-[var(--surface)] p-4 text-left ring-1 transition hover:bg-[var(--hover)] ${active ? `ring-2 ${tone.ring}` : 'ring-[var(--border)]'}`}>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone.icon}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-none text-[var(--text)]">{value}</span>
        <span className="mt-1 block text-sm font-semibold text-[var(--text)]">{title}</span>
        <span className="block text-[11px] text-[var(--text-muted)]">{sub}</span>
      </span>
    </button>
  )
}

function FilterSelect<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <label className="relative flex items-center gap-1.5 rounded-xl bg-[var(--input-bg)] px-3 py-2.5 text-sm ring-1 ring-[var(--border)] transition focus-within:ring-blue-500/40">
      <span className="whitespace-nowrap text-[var(--text-muted)]">{label}:</span>
      <select value={value} onChange={e => onChange(e.target.value as T)} className="cursor-pointer appearance-none bg-transparent pr-4 font-semibold text-[var(--text)] outline-none">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-[var(--text-faint)]" />
    </label>
  )
}

const COLS = 'grid-cols-[1.3fr_1fr_1fr_0.8fr_1.5fr_1.1fr_1.2fr_0.3fr]'
function TicketTable({ rows, nowMs }: { rows: TabRow[]; nowMs: number }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[920px]">
        <div className={`grid ${COLS} gap-3 border-b border-[var(--border)] px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]`}>
          <span>Ticket ID</span><span>Category</span><span>Status</span><span>Priority</span><span>Next action</span><span>SLA status</span><span>Updated</span><span />
        </div>
        {rows.map(t => {
          const sla = slaStatus(t, nowMs)
          return (
            <Link key={t.id} href={t.href} className={`grid ${COLS} items-center gap-3 border-b border-[var(--border)] px-2 py-3 text-sm transition last:border-0 hover:bg-[var(--hover)]`}>
              <span className="truncate font-mono text-[13px] text-[var(--text)]">{t.jobRef ?? '—'}</span>
              <span className="truncate text-[var(--text-muted)]">{t.category}</span>
              <span><span className={`inline-flex w-full max-w-[112px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${t.statusCls}`}>{t.statusLabel}</span></span>
              <span><span className={`inline-flex w-full max-w-[78px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${priorityBadge(t.priority)}`}>{priorityText(t.priority)}</span></span>
              <span className={`truncate ${t.nextActionAct ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>{t.nextAction}</span>
              <span className={`flex items-center gap-1.5 font-medium ${sla.cls}`}><sla.Icon size={14} className="shrink-0" /> <span className="truncate">{sla.label}</span></span>
              <span className="truncate text-[var(--text-muted)]">{formatDateTime(t.createdAt)}</span>
              <ChevronRight size={16} className="justify-self-end text-[var(--text-faint)]" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}

const isDone = (t: TabRow) => t.intent === 'done'

export function TicketTabView({ rows, grouped, newHref, subtitle, statusOptions, statLabels, storageKey, initialFilter, onStoreOverview }: {
  rows: TabRow[]
  grouped: boolean
  newHref?: string
  subtitle: string
  statusOptions: { value: string; label: string }[]   // includes 'all' / 'active' / 'completed' + role buckets
  statLabels: Record<Intent, [string, string]>          // [title, sub]
  storageKey: string
  initialFilter?: string                                 // seed status/advanced (e.g. deep-link)
  onStoreOverview?: (storeName: string) => void
}) {
  const seedAdv = initialFilter === 'overdue' || initialFilter === 'breached'
  const [q, setQ] = useState('')
  const [intent, setIntent] = useState<Intent | null>(null)
  const [status, setStatus] = useState<string>(initialFilter && !seedAdv && statusOptions.some(o => o.value === initialFilter) ? initialFilter : 'all')
  const [priority, setPriority] = useState<'all' | '0' | '1' | '2' | '3'>('all')
  const [store, setStore] = useState<string>('all')
  const [sort, setSort] = useState<'urgent' | 'newest' | 'oldest' | 'sla'>('urgent')
  const [adv, setAdv] = useState<Set<string>>(new Set(seedAdv ? [initialFilter!] : []))
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [archiveOpen, setArchiveOpen] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const s = params.get('store')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads window.location (client-only) after mount for deep-links; cannot run during SSR render
    if (s && grouped) setStore(s)
    const f = params.get('filter')
    if (f === 'overdue' || f === 'breached') setAdv(new Set([f]))
    else if (f && statusOptions.some(o => o.value === f)) setStatus(f)
  }, [grouped, statusOptions])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restores persisted state from localStorage (client-only) after mount; cannot run during SSR render
    setExpanded(new Set(readCollapseSet(`${storageKey}-expanded`)))
    setArchiveOpen(readCollapse(`${storageKey}-archive`) ?? false)
  }, [storageKey])

  const storeNames = useMemo(() => [...new Set(rows.map(t => t.storeName))].sort((a, b) => a.localeCompare(b)), [rows])

  const stats = useMemo(() => {
    const c = { mine: 0, awaiting: 0, critical: 0, done: 0 }
    for (const t of rows) { c[t.intent]++; if (t.intent !== 'done' && (t.overdue || t.breached)) c.critical++ }
    return c
  }, [rows])

  const terms = useMemo(() => q.toLowerCase().split(/\s+/).filter(Boolean), [q])
  const base = useMemo(() => (t: TabRow) => {
    if (priority !== 'all' && urgency(t.priority) !== Number(priority)) return false
    if (grouped && store !== 'all' && t.storeName !== store) return false
    if (adv.has('overdue') && !t.overdue) return false
    if (adv.has('breached') && !(t.breached && !t.overdue)) return false
    if (terms.length) {
      const hay = `${t.category} ${t.storeName} ${t.branchCode ?? ''} ${t.jobRef ?? ''} ${t.statusLabel}`.toLowerCase()
      if (!terms.every(w => hay.includes(w))) return false
    }
    return true
  }, [priority, store, adv, terms, grouped])

  const pass = useMemo(() => (t: TabRow) => {
    if (!base(t)) return false
    // Rows carry mine/awaiting/done; "critical" is a cross-cut (active + overdue/breached).
    if (intent === 'critical') return !isDone(t) && (t.overdue || t.breached)
    if (intent) return t.intent === intent
    if (status === 'all') return true
    if (status === 'active') return !isDone(t)
    if (status === 'completed') return isDone(t)
    return t.bucket === status
  }, [base, intent, status])

  const sorter = SORTERS[sort]
  const shown = useMemo(() => rows.filter(pass).sort(sorter), [rows, pass, sorter])
  const isDefault = intent === null && status === 'all'
  const archived = useMemo(() => isDefault && !grouped ? [] : (isDefault ? rows.filter(t => base(t) && isDone(t)).sort(sorter) : []), [rows, base, sorter, isDefault, grouped])

  const groups = useMemo(() => {
    const m = new Map<string, { branchCode: string | null; rows: TabRow[] }>()
    for (const t of shown) { const g = m.get(t.storeName) ?? { branchCode: t.branchCode, rows: [] }; g.rows.push(t); m.set(t.storeName, g) }
    // eslint-disable-next-line react-hooks/purity -- cosmetic "next SLA" ordering; not hydration-critical
    const nowMs = Date.now()
    const nextSlaOf = (rr: TabRow[]) => { const up = rr.map(t => t.slaDueAt ? +new Date(t.slaDueAt) : Infinity).filter(ms => ms > nowMs); return up.length ? Math.min(...up) : Infinity }
    return [...m.entries()].sort((a, b) => nextSlaOf(a[1].rows) - nextSlaOf(b[1].rows) || a[0].localeCompare(b[0]))
  }, [shown])

  const toggle = (s: string) => setExpanded(c => { const n = new Set(c); n.has(s) ? n.delete(s) : n.add(s); writeCollapseSet(`${storageKey}-expanded`, [...n]); return n })
  const toggleArchive = () => setArchiveOpen(o => { const v = !o; writeCollapse(`${storageKey}-archive`, v); return v })
  const pickIntent = (i: Intent) => { setIntent(cur => cur === i ? null : i); setStatus('all') }
  const clearFilters = () => { setIntent(null); setStatus('all'); setPriority('all'); setStore('all'); setAdv(new Set()); setQ(''); setFiltersOpen(false) }

  const didAutoExpand = useRef(false)
  useEffect(() => {
    if (didAutoExpand.current || !grouped) return
    const params = new URLSearchParams(window.location.search)
    if (!params.get('filter') && !params.get('expand')) return
    didAutoExpand.current = true
    const names = groups.map(([s]) => s)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot auto-expand from a client-only URL query param; cannot run during SSR render
    setExpanded(new Set(names)); writeCollapseSet(`${storageKey}-expanded`, names)
  }, [groups, grouped, storageKey])

  // eslint-disable-next-line react-hooks/purity -- cosmetic per-render clock for SLA countdowns/orderings; not hydration-critical
  const nowMs = Date.now()

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]"><Ticket className="text-blue-600 dark:text-blue-400" size={22} /> Tickets</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">{subtitle}</p>
        </div>
        {newHref && <Link href={newHref} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"><PlusCircle size={16} /> Log a Ticket</Link>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard intent="mine" icon={<User size={20} />} value={stats.mine} title={statLabels.mine[0]} sub={statLabels.mine[1]} active={intent === 'mine'} onClick={() => pickIntent('mine')} />
        <StatCard intent="awaiting" icon={<Ticket size={20} />} value={stats.awaiting} title={statLabels.awaiting[0]} sub={statLabels.awaiting[1]} active={intent === 'awaiting'} onClick={() => pickIntent('awaiting')} />
        <StatCard intent="critical" icon={<AlertTriangle size={20} />} value={stats.critical} title={statLabels.critical[0]} sub={statLabels.critical[1]} active={intent === 'critical'} onClick={() => pickIntent('critical')} />
        <StatCard intent="done" icon={<CheckCircle2 size={20} />} value={stats.done} title={statLabels.done[0]} sub={statLabels.done[1]} active={intent === 'done'} onClick={() => pickIntent('done')} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tickets…" className="w-full rounded-xl bg-[var(--input-bg)] py-2.5 pl-9 pr-3 text-sm text-[var(--text)] ring-1 ring-[var(--border)] outline-none placeholder-[var(--text-faint)] focus:ring-blue-500/40" />
        </div>
        <FilterSelect label="Status" value={status} onChange={v => { setStatus(v); setIntent(null) }} options={statusOptions} />
        <FilterSelect label="Priority" value={priority} onChange={setPriority} options={[{ value: 'all', label: 'All' }, { value: '0', label: 'Critical' }, { value: '1', label: 'High' }, { value: '2', label: 'Medium' }, { value: '3', label: 'Low' }]} />
        {grouped && <FilterSelect label="Store" value={store} onChange={setStore} options={[{ value: 'all', label: 'All stores' }, ...storeNames.map(s => ({ value: s, label: s }))]} />}
        <FilterSelect label="Sort by" value={sort} onChange={setSort} options={[{ value: 'urgent', label: 'Most urgent' }, { value: 'sla', label: 'Next SLA' }, { value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }]} />
        <div className="relative">
          <button type="button" onClick={() => setFiltersOpen(o => !o)} aria-expanded={filtersOpen} className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold ring-1 transition ${adv.size ? 'bg-blue-500/10 text-blue-500 ring-blue-500/40' : 'text-[var(--text-muted)] ring-[var(--border)] hover:bg-[var(--hover)]'}`}>
            <SlidersHorizontal size={15} /> Filters{adv.size ? ` (${adv.size})` : ''}
          </button>
          {filtersOpen && (
            <>
              <button aria-hidden tabIndex={-1} onClick={() => setFiltersOpen(false)} className="fixed inset-0 z-10 cursor-default" />
              <div className="absolute right-0 z-20 mt-2 w-60 rounded-xl bg-[var(--surface-2)] p-2 ring-1 ring-[var(--border)] shadow-lg shadow-black/20">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Refine</p>
                {([['overdue', 'Overdue'], ['breached', 'SLA breached']] as const).map(([k, label]) => (
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

      {/* Flat table (single-store SM) OR store-grouped cards. */}
      {!grouped ? (
        shown.length
          ? <Card className="p-2"><TicketTable rows={shown} nowMs={nowMs} /></Card>
          : <Card className="p-5"><p className="text-center text-sm text-[var(--text-faint)]">No tickets match.</p></Card>
      ) : (
        <>
          {groups.map(([storeName, g]) => {
            const isCollapsed = !expanded.has(storeName)
            const active = g.rows.filter(t => !isDone(t))
            const openN = active.length
            const critical = active.filter(t => urgency(t.priority) === 0).length
            const overdue = active.filter(t => t.overdue).length
            const topRank = active.length ? Math.min(...active.map(t => urgency(t.priority))) : 3
            const accent = accentOf(topRank)
            const up = active.map(t => t.slaDueAt ? +new Date(t.slaDueAt) : Infinity).filter(ms => ms > nowMs)
            const nextSla = up.length ? Math.min(...up) : null
            return (
              <div key={storeName} className="overflow-hidden rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)]">
                <div role="button" tabIndex={0} aria-expanded={!isCollapsed} onClick={() => toggle(storeName)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(storeName) } }} className="flex cursor-pointer items-center gap-3 p-4 transition hover:bg-[var(--hover)]">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${accent.icon}`}><Store size={20} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className="truncate text-base font-bold text-[var(--text)]">{storeName}</span>{g.branchCode && <span className="shrink-0 text-sm text-[var(--text-muted)]">· {g.branchCode}</span>}</span>
                    <span className="mt-0.5 block text-sm text-[var(--text-muted)]">{openN} open{critical > 0 && <> · <span className="font-semibold text-red-600 dark:text-red-400">{critical} critical</span></>}{overdue > 0 && <> · <span className="font-semibold text-amber-600 dark:text-amber-400">{overdue} overdue</span></>}</span>
                  </span>
                  {onStoreOverview && <button type="button" onClick={e => { e.stopPropagation(); onStoreOverview(storeName) }} title="Store overview" className="shrink-0 rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-blue-500/10 hover:text-blue-500"><BarChart3 size={16} /></button>}
                  <span className="shrink-0 text-right">
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
        </>
      )}

      {archived.length > 0 && (
        <Card className="cursor-pointer p-3 transition hover:ring-blue-500/30" onClick={toggleArchive} role="button" tabIndex={0} aria-expanded={archiveOpen} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleArchive() } }}>
          <div className="flex w-full items-center gap-2">
            <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${archiveOpen ? 'rotate-180' : ''}`} />
            <span className="text-sm font-bold text-[var(--text)]">Archive · Completed</span>
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] dark:bg-white/10">{archived.length}</span>
          </div>
          {archiveOpen && (
            <div className="mt-1 px-1" onClick={e => e.stopPropagation()}>
              {archived.map(t => (
                <Link key={t.id} href={t.href} className="-mx-2 flex items-center justify-between gap-2 rounded-lg border-b border-[var(--border)] px-2 py-2.5 transition last:border-0 hover:bg-[var(--hover)]">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--text)]">{t.category}</p>
                    <p className="truncate text-sm text-[var(--text-muted)]">{t.storeName} · {formatDateTime(t.createdAt)}</p>
                  </div>
                  <div className="grid shrink-0 grid-cols-1 justify-items-end gap-1.5 sm:grid-cols-[4.5rem_7rem] sm:justify-items-stretch">
                    <PriorityBadge priority={t.priority} className="w-full text-center" />
                    <span className={`w-full rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${t.statusCls}`}>{t.statusLabel}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
