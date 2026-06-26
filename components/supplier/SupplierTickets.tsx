'use client'

// Supplier Tickets tab — search, supplier-workflow filters + distribution bar,
// collapsible store groups, and a slide-out store panel with SLA / work / quote
// stats. Mirrors the RM tickets tab, tailored to the supplier's lifecycle.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Ticket, Search, ChevronDown, BarChart3, X } from 'lucide-react'
import type { SupplierTicketRow, SupplierQuoteRow } from '@/lib/health/data'
import { Card, Donut } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { rmStatusMeta, formatDateTime } from '@/lib/utils'

type Bucket = 'to_quote' | 'quoted' | 'scheduled' | 'in_progress' | 'signoff' | 'completed' | 'closed'
function bucketOf(s: string): Bucket {
  if (['open', 'info_requested', 'assigned', 'assessment', 'quote_requested', 'quote_revision'].includes(s)) return 'to_quote'
  if (s === 'quoted') return 'quoted'
  if (['accepted', 'scheduled'].includes(s)) return 'scheduled'
  if (['in_progress', 'variation_review', 'variation_accepted'].includes(s)) return 'in_progress'
  if (['submitted_for_signoff', 'evidence_requested', 'snag', 'snag_assigned', 'snag_resolved', 'approved_closeout', 'pending_sign_off', 'snag_in_progress'].includes(s)) return 'signoff'
  if (s === 'completed') return 'completed'
  return 'closed'   // declined / cancelled
}
const BUCKET_LABEL: Record<Bucket, string> = { to_quote: 'To Quote', quoted: 'Quoted', scheduled: 'Scheduled', in_progress: 'In Progress', signoff: 'Sign-off', completed: 'Completed', closed: 'Closed' }
const BUCKET_BAR: Record<Bucket, string> = { to_quote: 'bg-cyan-500', quoted: 'bg-violet-500', scheduled: 'bg-teal-500', in_progress: 'bg-[#C6A35D]', signoff: 'bg-orange-500', completed: 'bg-emerald-500', closed: 'bg-red-500' }
const BAR_ORDER: Bucket[] = ['to_quote', 'quoted', 'scheduled', 'in_progress', 'signoff', 'completed']

// Urgency rank (handles classic low/medium/high/urgent and engine P1–P4).
const URGENCY: Record<string, number> = { urgent: 0, P1: 0, high: 1, P2: 1, medium: 2, P3: 2, low: 3, P4: 3 }
const urgency = (p: string) => URGENCY[p] ?? 5
const byDateThenUrgency = (a: SupplierTicketRow, b: SupplierTicketRow) =>
  (+new Date(b.createdAt) - +new Date(a.createdAt)) || (urgency(a.priority) - urgency(b.priority))

const PILLS: { key: 'all' | 'breached' | Bucket; label: string; active: string; inactive: string }[] = [
  { key: 'all', label: 'All', active: 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-[#0a0e17] dark:border-white', inactive: 'text-[var(--text-muted)] border-[var(--border)] hover:border-slate-400' },
  { key: 'breached', label: 'SLA Breached', active: 'bg-red-600 text-white border-red-600', inactive: 'text-red-600 dark:text-red-400 border-red-500/50 hover:border-red-500' },
  { key: 'to_quote', label: 'To Quote', active: 'bg-cyan-500 text-white border-cyan-500', inactive: 'text-cyan-600 dark:text-cyan-400 border-cyan-500/40 hover:border-cyan-400' },
  { key: 'quoted', label: 'Quoted', active: 'bg-violet-500 text-white border-violet-500', inactive: 'text-violet-600 dark:text-violet-400 border-violet-500/40 hover:border-violet-400' },
  { key: 'scheduled', label: 'Scheduled', active: 'bg-teal-500 text-white border-teal-500', inactive: 'text-teal-600 dark:text-teal-400 border-teal-500/40 hover:border-teal-400' },
  { key: 'in_progress', label: 'In Progress', active: 'bg-[#C6A35D] text-[#0a0e17] border-[#C6A35D]', inactive: 'text-amber-600 dark:text-[#C6A35D] border-[#C6A35D]/40 hover:border-[#C6A35D]' },
  { key: 'signoff', label: 'Sign-off', active: 'bg-orange-500 text-white border-orange-500', inactive: 'text-orange-600 dark:text-orange-400 border-orange-500/40 hover:border-orange-400' },
  { key: 'completed', label: 'Completed', active: 'bg-emerald-500 text-white border-emerald-500', inactive: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 hover:border-emerald-400' },
  { key: 'closed', label: 'Closed', active: 'bg-red-500 text-white border-red-500', inactive: 'text-red-600 dark:text-red-400 border-red-500/40 hover:border-red-400' },
]

function milestone(t: SupplierTicketRow): { label: string; at: string } | null {
  if (t.quoteApprovedAt) return { label: 'Quote approved', at: t.quoteApprovedAt }
  if (t.quoteRequestedAt) return { label: 'Quote requested', at: t.quoteRequestedAt }
  if (t.assignedAt) return { label: 'Assigned', at: t.assignedAt }
  return null
}

function TicketRow({ t }: { t: SupplierTicketRow }) {
  const sm = rmStatusMeta(t.status)
  const m = milestone(t)
  return (
    <Link href={`/supplier/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2.5 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
      <div className="min-w-0">
        <p className="text-sm text-[var(--text)] truncate">{t.title}</p>
        <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(t.createdAt)}{t.breached ? ' · ⚠ breached' : ''}</p>
        {m && <p className={`text-[11px] font-medium ${sm.text}`}>{m.label} · {formatDateTime(m.at)}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_7rem] gap-1.5 shrink-0 justify-items-end sm:justify-items-stretch">
        <PriorityBadge priority={t.priority} className="w-full text-center" />
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${sm.cls}`}>{sm.label}</span>
      </div>
    </Link>
  )
}

export function SupplierTickets({ tickets, quotes }: { tickets: SupplierTicketRow[]; quotes: SupplierQuoteRow[] }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'breached' | Bucket>('all')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [panelStore, setPanelStore] = useState<string | null>(null)

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('store')
    if (s) setPanelStore(s)
  }, [])

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { to_quote: 0, quoted: 0, scheduled: 0, in_progress: 0, signoff: 0, completed: 0, closed: 0 }
    for (const t of tickets) c[bucketOf(t.status)]++
    return c
  }, [tickets])
  const barTotal = BAR_ORDER.reduce((s, b) => s + counts[b], 0) || 1
  const breachedCount = useMemo(() => tickets.filter(t => t.breached).length, [tickets])

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return tickets.filter(t => {
      if (filter === 'breached') { if (!t.breached) return false }
      else if (filter !== 'all' && bucketOf(t.status) !== filter) return false
      if (!terms.length) return true
      const hay = `${t.title} ${t.storeName} ${t.branchCode ?? ''} ${rmStatusMeta(t.status).label}`.toLowerCase()
      return terms.every(w => hay.includes(w))
    })
  }, [tickets, q, filter])

  // Under "All": breached pins to the top, completed drops into the Archive, the
  // rest groups by store. Everything is ordered newest → most urgent.
  const breachedRows = useMemo(() => filter === 'all' ? shown.filter(t => t.breached).sort(byDateThenUrgency) : [], [shown, filter])
  const liveShown = useMemo(() => (filter === 'all' ? shown.filter(t => !t.breached && bucketOf(t.status) !== 'completed') : shown).slice().sort(byDateThenUrgency), [shown, filter])
  const archived = useMemo(() => (filter === 'all' ? shown.filter(t => bucketOf(t.status) === 'completed') : []).slice().sort(byDateThenUrgency), [shown, filter])
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [breachedOpen, setBreachedOpen] = useState(true)

  const groups = useMemo(() => {
    const m = new Map<string, { branchCode: string | null; rows: SupplierTicketRow[] }>()
    for (const t of liveShown) { const g = m.get(t.storeName) ?? { branchCode: t.branchCode, rows: [] }; g.rows.push(t); m.set(t.storeName, g) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [liveShown])

  const toggle = (s: string) => setCollapsed(c => { const n = new Set(c); n.has(s) ? n.delete(s) : n.add(s); return n })
  const panelRows = useMemo(() => panelStore ? tickets.filter(t => t.storeName === panelStore) : [], [tickets, panelStore])
  const panelQuotes = useMemo(() => panelStore ? quotes.filter(qq => qq.storeName === panelStore) : [], [quotes, panelStore])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Ticket className="text-blue-600 dark:text-blue-400" size={22} /> Tickets</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Grouped by store. Tap the chart icon for a store overview.</p>
      </div>

      {/* Distribution bar (excludes closed) */}
      <Card className="p-4 space-y-2">
        <div className="h-3 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden flex">
          {BAR_ORDER.map(b => counts[b] > 0 && <div key={b} className={`h-full ${BUCKET_BAR[b]}`} style={{ width: `${Math.round((counts[b] / barTotal) * 100)}%` }} />)}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:flex sm:flex-wrap">
          {BAR_ORDER.map(b => <span key={b} className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className={`w-2 h-2 rounded-full ${BUCKET_BAR[b]}`} />{BUCKET_LABEL[b]} {counts[b]}</span>)}
          {counts.closed > 0 && <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className="w-2 h-2 rounded-full bg-red-500" />Closed {counts.closed}</span>}
        </div>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tickets…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] outline-none focus:ring-[#C6A35D]/40" />
      </div>

      {/* Filter pills */}
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {PILLS.map(p => {
          const n = p.key === 'all' ? tickets.length : p.key === 'breached' ? breachedCount : counts[p.key]
          const on = filter === p.key
          return (
            <button key={p.key} onClick={() => setFilter(p.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition text-center ${on ? p.active : p.inactive}`}>
              {p.label} <span className="opacity-70">{n}</span>
            </button>
          )
        })}
      </div>

      {/* SLA breached — pinned at the top under the All filter, collapsible */}
      {filter === 'all' && breachedRows.length > 0 && (
        <Card className="p-3 ring-1 ring-red-500/40">
          <button onClick={() => setBreachedOpen(o => !o)} aria-expanded={breachedOpen} className="w-full flex items-center gap-2 -m-1 p-1 rounded-lg hover:bg-[var(--hover)] transition">
            <ChevronDown size={16} className={`shrink-0 text-red-500 transition-transform ${breachedOpen ? '' : '-rotate-90'}`} />
            <span className="text-sm font-bold text-red-600 dark:text-red-400">SLA Breached</span>
            <span className="text-[11px] font-medium text-red-700 dark:text-red-400 bg-red-500/15 rounded-full px-2 py-0.5">{breachedRows.length}</span>
          </button>
          {breachedOpen && <div className="px-1 mt-1">{breachedRows.map(t => <TicketRow key={t.id} t={t} />)}</div>}
        </Card>
      )}

      {/* Store groups */}
      {groups.map(([store, g]) => {
        const isCollapsed = collapsed.has(store)
        return (
          <Card key={store} className="p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <button onClick={() => toggle(store)} aria-expanded={!isCollapsed} className="flex items-center gap-2 min-w-0 -m-1 p-1 rounded-lg hover:bg-[var(--hover)] transition">
                <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                <span className="text-sm font-bold text-[var(--text)] truncate">{store}</span>
                <span className="text-[11px] font-medium text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5">{g.rows.length}</span>
              </button>
              <button onClick={() => setPanelStore(store)} title="Store overview" className="shrink-0 -m-1 p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[#C6A35D] hover:bg-[#C6A35D]/10 transition"><BarChart3 size={16} /></button>
            </div>
            {!isCollapsed && <div className="px-1">{g.rows.map(t => <TicketRow key={t.id} t={t} />)}</div>}
          </Card>
        )
      })}
      {!groups.length && !archived.length && !breachedRows.length && <Card className="p-5"><p className="text-sm text-[var(--text-faint)] text-center">No tickets match.</p></Card>}

      {/* Archive — completed tickets, only under the All filter */}
      {archived.length > 0 && (
        <Card className="p-3">
          <button onClick={() => setArchiveOpen(o => !o)} aria-expanded={archiveOpen} className="w-full flex items-center gap-2 -m-1 p-1 rounded-lg hover:bg-[var(--hover)] transition">
            <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${archiveOpen ? '' : '-rotate-90'}`} />
            <span className="text-sm font-bold text-[var(--text)]">Archive · Completed</span>
            <span className="text-[11px] font-medium text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5">{archived.length}</span>
          </button>
          {archiveOpen && (
            <div className="px-1">
              {archived.map(t => {
                const sm = rmStatusMeta(t.status)
                return (
                  <Link key={t.id} href={`/supplier/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2.5 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
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

      {panelStore && <StorePanel store={panelStore} rows={panelRows} quotes={panelQuotes} onClose={() => setPanelStore(null)} />}
    </div>
  )
}

function StorePanel({ store, rows, quotes, onClose }: { store: string; rows: SupplierTicketRow[]; quotes: SupplierQuoteRow[]; onClose: () => void }) {
  const c: Record<Bucket, number> = { to_quote: 0, quoted: 0, scheduled: 0, in_progress: 0, signoff: 0, completed: 0, closed: 0 }
  for (const t of rows) c[bucketOf(t.status)]++
  const total = rows.length
  const barTotal = BAR_ORDER.reduce((s, b) => s + c[b], 0) || 1
  const active = rows.filter(t => t.active)
  const overdue = active.filter(t => t.breached).length
  const slaScore = active.length ? Math.round(100 * (active.length - overdue) / active.length) : 100
  const slaStatus = slaScore >= 80 ? 'controlled' : slaScore >= 60 ? 'attention' : slaScore >= 40 ? 'at_risk' : 'critical'

  // Quote acceptance + evidence completion.
  const decided = quotes.filter(qq => qq.status === 'accepted' || qq.status === 'declined')
  const acceptRate = decided.length ? Math.round(100 * decided.filter(qq => qq.status === 'accepted').length / decided.length) : null
  const evReq = active.filter(t => t.evidenceRequired)
  const evDone = evReq.filter(t => t.beforeUploaded && t.afterUploaded && t.cocUploaded).length
  const evRate = evReq.length ? Math.round(100 * evDone / evReq.length) : null

  const Stat = ({ label, value, tone = '' }: { label: string; value: number | string; tone?: string }) => (
    <div className="rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-3">
      <div className={`text-xl font-bold ${tone || 'text-[var(--text)]'}`}>{value}</div>
      <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-sm h-full bg-[var(--surface-2)] ring-1 ring-[var(--border)] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><h2 className="text-lg font-bold text-[var(--text)] truncate">{store}</h2><p className="text-xs text-[var(--text-muted)]">{total} ticket{total === 1 ? '' : 's'}</p></div>
          <button onClick={onClose} className="shrink-0 -m-1 p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--hover)]"><X size={18} /></button>
        </div>

        {/* SLA donut */}
        <div className="flex items-center gap-4">
          <Donut value={slaScore} status={slaStatus} size={96} label="SLA" />
          <div className="text-xs text-[var(--text-muted)] space-y-0.5">
            <p><span className="text-[var(--text)] font-semibold">{active.length}</span> active · <span className={overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-[var(--text)]'}>{overdue}</span> overdue</p>
            {acceptRate != null && <p>Quote acceptance <span className="text-[var(--text)] font-semibold">{acceptRate}%</span></p>}
            {evRate != null && <p>Evidence complete <span className="text-[var(--text)] font-semibold">{evRate}%</span></p>}
          </div>
        </div>

        {/* Status distribution */}
        <div className="space-y-2">
          <div className="h-3 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden flex">
            {BAR_ORDER.map(b => c[b] > 0 && <div key={b} className={`h-full ${BUCKET_BAR[b]}`} style={{ width: `${Math.round((c[b] / barTotal) * 100)}%` }} />)}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {([...BAR_ORDER, 'closed'] as Bucket[]).map(b => c[b] > 0 && (
              <span key={b} className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className={`w-2 h-2 rounded-full ${BUCKET_BAR[b]}`} />{BUCKET_LABEL[b]} {c[b]}</span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="To quote / quoted" value={c.to_quote + c.quoted} />
          <Stat label="In progress" value={c.scheduled + c.in_progress} />
          <Stat label="Sign-off" value={c.signoff} tone={c.signoff ? 'text-orange-600 dark:text-orange-400' : 'text-[var(--text)]'} />
          <Stat label="Completed" value={c.completed} />
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Tickets</div>
          {rows.map(t => <TicketRow key={t.id} t={t} />)}
        </div>
      </div>
    </div>
  )
}
