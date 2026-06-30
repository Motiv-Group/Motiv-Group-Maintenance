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
import { SlideOver } from '@/components/ui/SlideOver'
import { readCollapse, writeCollapse, readCollapseSet, writeCollapseSet } from '@/lib/collapse-state'
import { rmStatusMeta, formatDateTime, humanizeDuration } from '@/lib/utils'

type Bucket = 'to_quote' | 'quoted' | 'approved' | 'scheduled' | 'in_progress' | 'signoff' | 'completed' | 'closed'
function bucketOf(s: string): Bucket {
  if (['open', 'info_requested', 'assigned', 'assessment', 'quote_requested', 'quote_revision'].includes(s)) return 'to_quote'
  if (['quoted', 'variation_review'].includes(s)) return 'quoted'
  if (s === 'accepted') return 'approved'
  if (s === 'scheduled') return 'scheduled'
  if (['in_progress', 'variation_accepted'].includes(s)) return 'in_progress'
  if (['submitted_for_signoff', 'evidence_requested', 'snag', 'snag_assigned', 'snag_resolved', 'approved_closeout', 'pending_sign_off', 'snag_in_progress'].includes(s)) return 'signoff'
  if (s === 'completed') return 'completed'
  return 'closed'   // declined / cancelled
}
const BUCKET_LABEL: Record<Bucket, string> = { to_quote: 'Quote requested', quoted: 'Quoted', approved: 'Quote approved', scheduled: 'Job scheduled', in_progress: 'In Progress', signoff: 'Sign-off', completed: 'Completed', closed: 'Closed' }
const BUCKET_BAR: Record<Bucket, string> = { to_quote: 'bg-cyan-500', quoted: 'bg-violet-500', approved: 'bg-teal-500', scheduled: 'bg-indigo-500', in_progress: 'bg-[#C6A35D]', signoff: 'bg-orange-500', completed: 'bg-emerald-500', closed: 'bg-red-500' }
const BAR_ORDER: Bucket[] = ['to_quote', 'quoted', 'approved', 'scheduled', 'in_progress', 'signoff', 'completed']

// Urgency rank (handles classic low/medium/high/urgent and engine P1–P4).
const URGENCY: Record<string, number> = { urgent: 0, P1: 0, high: 1, P2: 1, medium: 2, P3: 2, low: 3, P4: 3 }
const urgency = (p: string) => URGENCY[p] ?? 5
const byDateThenUrgency = (a: SupplierTicketRow, b: SupplierTicketRow) =>
  (+new Date(b.createdAt) - +new Date(a.createdAt)) || (urgency(a.priority) - urgency(b.priority))

// Active tickets where evidence is required but not all of before/after/COC are uploaded.
const missingEvidence = (t: SupplierTicketRow) => t.active && t.evidenceRequired && !(t.beforeUploaded && t.afterUploaded && t.cocUploaded)

type FilterKey = 'all' | 'breached' | 'overdue' | 'evidence' | 'declined' | 'cancelled' | Bucket
const PILLS: { key: FilterKey; label: string; active: string; inactive: string }[] = [
  { key: 'all', label: 'All', active: 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-[#0a0e17] dark:border-white', inactive: 'text-[var(--text-muted)] border-[var(--border)] hover:border-slate-400' },
  { key: 'breached', label: 'SLA Breached', active: 'bg-red-600 text-white border-red-600', inactive: 'text-red-600 dark:text-red-400 border-red-500/50 hover:border-red-500' },
  { key: 'overdue', label: 'Overdue', active: 'bg-red-500 text-white border-red-500', inactive: 'text-red-600 dark:text-red-400 border-red-500/40 hover:border-red-400' },
  { key: 'evidence', label: 'Missing Evidence', active: 'bg-amber-500 text-white border-amber-500', inactive: 'text-amber-600 dark:text-amber-500 border-amber-500/50 hover:border-amber-500' },
  { key: 'to_quote', label: 'Quote requested', active: 'bg-cyan-500 text-white border-cyan-500', inactive: 'text-cyan-600 dark:text-cyan-400 border-cyan-500/40 hover:border-cyan-400' },
  { key: 'quoted', label: 'Quoted', active: 'bg-violet-500 text-white border-violet-500', inactive: 'text-violet-600 dark:text-violet-400 border-violet-500/40 hover:border-violet-400' },
  { key: 'approved', label: 'Quote approved', active: 'bg-teal-500 text-white border-teal-500', inactive: 'text-teal-600 dark:text-teal-400 border-teal-500/40 hover:border-teal-400' },
  { key: 'scheduled', label: 'Job scheduled', active: 'bg-indigo-500 text-white border-indigo-500', inactive: 'text-indigo-600 dark:text-indigo-400 border-indigo-500/40 hover:border-indigo-400' },
  { key: 'in_progress', label: 'In Progress', active: 'bg-[#C6A35D] text-[#0a0e17] border-[#C6A35D]', inactive: 'text-amber-600 dark:text-[#C6A35D] border-[#C6A35D]/40 hover:border-[#C6A35D]' },
  { key: 'signoff', label: 'Sign-off', active: 'bg-orange-500 text-white border-orange-500', inactive: 'text-orange-600 dark:text-orange-400 border-orange-500/40 hover:border-orange-400' },
  { key: 'completed', label: 'Completed', active: 'bg-emerald-500 text-white border-emerald-500', inactive: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 hover:border-emerald-400' },
  { key: 'declined', label: 'Declined', active: 'bg-red-500 text-white border-red-500', inactive: 'text-red-600 dark:text-red-400 border-red-500/40 hover:border-red-400' },
  { key: 'cancelled', label: 'Cancelled', active: 'bg-gray-500 text-white border-gray-500', inactive: 'text-gray-600 dark:text-gray-400 border-gray-500/40 hover:border-gray-400' },
]

function milestone(t: SupplierTicketRow): { label: string; at: string } | null {
  // A declined supplier must never see the ticket's "Quote approved" (that was
  // another supplier) — show their own decline (or their last own milestone).
  if (t.declinedForMe) {
    const declinedLabel = t.declinedBy === 'supplier' ? 'Declined (you)' : 'Declined'
    if (t.declinedAt) return { label: declinedLabel, at: t.declinedAt }
    if (t.quoteSubmittedAt) return { label: 'Quoted', at: t.quoteSubmittedAt }
    if (t.quoteRequestedAt) return { label: 'Quote requested', at: t.quoteRequestedAt }
    return null
  }
  if (t.quoteApprovedAt) return { label: 'Quote approved', at: t.quoteApprovedAt }
  if (t.quoteSubmittedAt) return { label: 'Quoted', at: t.quoteSubmittedAt }
  if (t.quoteRequestedAt) return { label: 'Quote requested', at: t.quoteRequestedAt }
  if (t.assignedAt) return { label: 'Assigned', at: t.assignedAt }
  return null
}

// `showStore` adds a Company · Branch eyebrow — used in flat sections (SLA
// breached, archive). In store groups the heading already shows it, so it's off.
function TicketRow({ t, company, showStore }: { t: SupplierTicketRow; company?: string; showStore?: boolean }) {
  const sm = rmStatusMeta(t.status)
  const m = milestone(t)
  return (
    <Link href={`/supplier/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2.5 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
      <div className="min-w-0">
        {showStore && <p className="text-[10px] text-[var(--text-faint)] truncate">{[company, t.storeName].filter(Boolean).join(' · ')}</p>}
        <p className="text-sm text-[var(--text)] truncate">{t.title}</p>
        <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(t.createdAt)}</p>
        {t.overdue && <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">Overdue by {humanizeDuration(Date.now() - new Date(t.dueAt).getTime())}</p>}
        {m && <p className={`text-[11px] font-medium ${m.label.startsWith('Declined') ? 'text-red-600 dark:text-red-400' : sm.text}`}>{m.label} · {formatDateTime(m.at)}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_7rem] gap-1.5 shrink-0 justify-items-end sm:justify-items-stretch">
        <PriorityBadge priority={t.priority} className="w-full text-center" />
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${t.declinedForMe ? 'bg-red-500/15 text-red-700 dark:text-red-400' : sm.cls}`}>{t.declinedForMe ? (t.declinedBy === 'supplier' ? 'Declined (you)' : 'Declined') : sm.label}</span>
      </div>
    </Link>
  )
}

export function SupplierTickets({ tickets, quotes, company }: { tickets: SupplierTicketRow[]; quotes: SupplierQuoteRow[]; company: string }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  // Store groups start collapsed; the set tracks which the user has expanded.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [panelStore, setPanelStore] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const s = params.get('store')
    if (s) setPanelStore(s)
    const f = params.get('filter')
    if (f && PILLS.some(p => p.key === f)) setFilter(f as FilterKey)
  }, [])

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { to_quote: 0, quoted: 0, approved: 0, scheduled: 0, in_progress: 0, signoff: 0, completed: 0, closed: 0 }
    // A ticket awarded to another supplier counts as closed (declined), not as this
    // supplier's completed/active work.
    for (const t of tickets) c[t.declinedForMe ? 'closed' : bucketOf(t.status)]++
    return c
  }, [tickets])
  const barTotal = BAR_ORDER.reduce((s, b) => s + counts[b], 0) || 1
  // A supplier-side breach only counts while not yet fully overdue — once overdue
  // it moves to the Overdue pill (RM-side breaches never affect the supplier).
  const breachedCount = useMemo(() => tickets.filter(t => t.breached && !t.overdue).length, [tickets])
  const overdueCount = useMemo(() => tickets.filter(t => t.overdue).length, [tickets])
  const declinedCount = useMemo(() => tickets.filter(t => t.declinedForMe).length, [tickets])
  const cancelledCount = useMemo(() => tickets.filter(t => t.status === 'cancelled').length, [tickets])
  const evidenceCount = useMemo(() => tickets.filter(missingEvidence).length, [tickets])

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return tickets.filter(t => {
      if (filter === 'breached') { if (!(t.breached && !t.overdue)) return false }
      else if (filter === 'overdue') { if (!t.overdue) return false }
      else if (filter === 'declined') { if (!t.declinedForMe) return false }
      else if (filter === 'cancelled') { if (t.status !== 'cancelled') return false }
      else if (filter === 'evidence') { if (!missingEvidence(t)) return false }
      else if (filter !== 'all' && bucketOf(t.status) !== filter) return false
      // Tickets where this supplier was declined (and not re-invited) only show under Declined / Cancelled.
      if (filter !== 'declined' && filter !== 'cancelled' && t.declinedForMe) return false
      if (!terms.length) return true
      const hay = `${t.title} ${t.storeName} ${t.branchCode ?? ''} ${rmStatusMeta(t.status).label}`.toLowerCase()
      return terms.every(w => hay.includes(w))
    })
  }, [tickets, q, filter])

  // Under "All": breached pins to the top, completed drops into the Archive, the
  // rest groups by store. Everything is ordered newest → most urgent.
  const breachedRows = useMemo(() => filter === 'all' ? shown.filter(t => t.breached && !t.overdue).sort(byDateThenUrgency) : [], [shown, filter])
  const liveShown = useMemo(() => (filter === 'all' ? shown.filter(t => !(t.breached && !t.overdue) && bucketOf(t.status) !== 'completed') : shown).slice().sort(byDateThenUrgency), [shown, filter])
  const archived = useMemo(() => (filter === 'all' ? shown.filter(t => bucketOf(t.status) === 'completed') : []).slice().sort(byDateThenUrgency), [shown, filter])
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [breachedOpen, setBreachedOpen] = useState(false)

  // Restore the expand/collapse state the user left (per-session; wiped on sign-in)
  // so navigating into a ticket and back keeps the lists exactly as they were.
  useEffect(() => {
    setExpanded(new Set(readCollapseSet('supplier-tickets-expanded')))
    setBreachedOpen(readCollapse('supplier-tickets-breached') ?? false)
    setArchiveOpen(readCollapse('supplier-tickets-archive') ?? false)
  }, [])

  const groups = useMemo(() => {
    const m = new Map<string, { branchCode: string | null; rows: SupplierTicketRow[] }>()
    for (const t of liveShown) { const g = m.get(t.storeName) ?? { branchCode: t.branchCode, rows: [] }; g.rows.push(t); m.set(t.storeName, g) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [liveShown])

  const toggle = (s: string) => setExpanded(c => { const n = new Set(c); n.has(s) ? n.delete(s) : n.add(s); writeCollapseSet('supplier-tickets-expanded', [...n]); return n })
  const toggleBreached = () => setBreachedOpen(o => { const v = !o; writeCollapse('supplier-tickets-breached', v); return v })
  const toggleArchive = () => setArchiveOpen(o => { const v = !o; writeCollapse('supplier-tickets-archive', v); return v })
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
      </Card>

      {/* Filter pills — above the search */}
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {PILLS.map(p => {
          const n = p.key === 'all' ? tickets.length : p.key === 'breached' ? breachedCount : p.key === 'overdue' ? overdueCount : p.key === 'declined' ? declinedCount : p.key === 'cancelled' ? cancelledCount : p.key === 'evidence' ? evidenceCount : counts[p.key]
          const on = filter === p.key
          return (
            <button key={p.key} onClick={() => setFilter(p.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition text-center ${on ? p.active : p.inactive}`}>
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

      {/* SLA breached — pinned at the top under the All filter, collapsible */}
      {filter === 'all' && breachedRows.length > 0 && (
        <Card className="p-3 ring-1 ring-red-500/40 cursor-pointer hover:ring-red-500/60 transition" onClick={toggleBreached} role="button" tabIndex={0} aria-expanded={breachedOpen} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBreached() } }}>
          <div className="w-full flex items-center gap-2">
            <ChevronDown size={16} className={`shrink-0 text-red-500 transition-transform ${breachedOpen ? 'rotate-180' : ''}`} />
            <span className="text-sm font-bold text-red-600 dark:text-red-400">SLA Breached</span>
            <span className="text-[11px] font-medium text-red-700 dark:text-red-400 bg-red-500/15 rounded-full px-2 py-0.5">{breachedRows.length}</span>
          </div>
          {breachedOpen && <div className="px-1 mt-1" onClick={e => e.stopPropagation()}>{breachedRows.map(t => <TicketRow key={t.id} t={t} company={company} showStore />)}</div>}
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
                <span className="text-sm font-bold text-[var(--text)] truncate">{[company, store].filter(Boolean).join(' · ')}{g.branchCode ? ` · ${g.branchCode}` : ''}</span>
                <span className="text-[11px] font-medium text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5 shrink-0">{g.rows.length}</span>
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
                  <Link key={t.id} href={`/supplier/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2.5 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
                    <div className="min-w-0">
                      <p className="text-[10px] text-[var(--text-faint)] truncate">{[company, t.storeName].filter(Boolean).join(' · ')}</p>
                      <p className="text-sm text-[var(--text)] truncate">{t.title}</p>
                      <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(t.createdAt)}</p>
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

      {panelStore && <StorePanel store={panelStore} company={company} rows={panelRows} quotes={panelQuotes} onClose={() => setPanelStore(null)} />}
    </div>
  )
}

function StorePanel({ store, company, rows, quotes, onClose }: { store: string; company?: string; rows: SupplierTicketRow[]; quotes: SupplierQuoteRow[]; onClose: () => void }) {
  const c: Record<Bucket, number> = { to_quote: 0, quoted: 0, approved: 0, scheduled: 0, in_progress: 0, signoff: 0, completed: 0, closed: 0 }
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
    <SlideOver onClose={onClose}>
      {close => (
        <>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">{company && <p className="text-[10px] text-[var(--text-faint)] truncate">{company}</p>}<h2 className="text-lg font-bold text-[var(--text)] truncate">{store}</h2><p className="text-xs text-[var(--text-muted)]">{total} ticket{total === 1 ? '' : 's'}</p></div>
          <button onClick={close} className="shrink-0 -m-1 p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--hover)]"><X size={18} /></button>
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
          <Stat label="In progress" value={c.approved + c.scheduled + c.in_progress} />
          <Stat label="Sign-off" value={c.signoff} tone={c.signoff ? 'text-orange-600 dark:text-orange-400' : 'text-[var(--text)]'} />
          <Stat label="Completed" value={c.completed} />
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Tickets</div>
          {rows.map(t => <TicketRow key={t.id} t={t} />)}
        </div>
        </>
      )}
    </SlideOver>
  )
}
