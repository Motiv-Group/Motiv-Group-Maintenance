'use client'

// Supplier Tickets tab — search, supplier-workflow filters + distribution bar,
// collapsible store groups, and a slide-out store panel with SLA / work / quote
// stats. Mirrors the RM tickets tab, tailored to the supplier's lifecycle.
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Ticket, Search, ChevronDown, BarChart3, Store, ReceiptText, Camera, FileText, CheckCircle2, Calendar, Loader2, ClipboardCheck, AlertTriangle, Clock, XCircle, Ban } from 'lucide-react'
import { TicketFilterTiles, type FilterGroup } from '@/components/ui/TicketFilterTiles'
import type { SupplierTicketRow, SupplierQuoteRow } from '@/lib/health/data'
import { Card, Donut } from '@/components/exec/ui'
import { CategoryIcon, priorityBadgeClass, priorityLabel } from '@/components/client/ticketBadges'
import { Modal } from '@/components/ui/Modal'
import { DrawerHeader } from '@/components/exec/Drawer'
import { readCollapse, writeCollapse, readCollapseSet, writeCollapseSet } from '@/lib/collapse-state'
import { rmStatusMeta, formatDateTime, humanizeDuration, urgencyCountCls } from '@/lib/utils'

type Bucket = 'to_quote' | 'quoted' | 'approved' | 'scheduled' | 'in_progress' | 'signoff' | 'completed' | 'closed'
function bucketOf(s: string): Bucket {
  if (['open', 'info_requested', 'assigned', 'assessment', 'quote_requested', 'quote_revision'].includes(s)) return 'to_quote'
  if (['quoted', 'variation_review'].includes(s)) return 'quoted'
  if (s === 'accepted') return 'approved'
  if (['scheduled', 'vo_declined'].includes(s)) return 'scheduled'
  if (['in_progress', 'variation_accepted'].includes(s)) return 'in_progress'
  if (['submitted_for_signoff', 'evidence_requested', 'snag', 'snag_assigned', 'snag_resolved', 'approved_closeout', 'pending_sign_off', 'snag_in_progress'].includes(s)) return 'signoff'
  if (s === 'completed') return 'completed'
  return 'closed'   // declined / cancelled
}
const BUCKET_LABEL: Record<Bucket, string> = { to_quote: 'Quote requested', quoted: 'Quoted', approved: 'Quote approved', scheduled: 'Job scheduled', in_progress: 'In Progress', signoff: 'Sign-off', completed: 'Completed', closed: 'Closed' }
const BUCKET_BAR: Record<Bucket, string> = { to_quote: 'bg-amber-500', quoted: 'bg-blue-500', approved: 'bg-blue-500', scheduled: 'bg-blue-500', in_progress: 'bg-blue-500', signoff: 'bg-blue-500', completed: 'bg-emerald-500', closed: 'bg-gray-500' }
const BAR_ORDER: Bucket[] = ['to_quote', 'quoted', 'approved', 'scheduled', 'in_progress', 'signoff', 'completed']

// Isolation: the status THIS supplier should see. Until awarded, they only ever see
// their own quote state ("Quoted" if they quoted, else "Quote requested") — never
// another supplier's progress. Awarded/declined use the real status (badge handles it).
function myStatus(t: SupplierTicketRow): string {
  if (t.awardedToMe || t.declinedForMe) return t.status
  return t.quotedByMe ? 'quoted' : 'quote_requested'
}
const bucketOfRow = (t: SupplierTicketRow) => bucketOf(myStatus(t))

// Urgency rank (handles classic low/medium/high/urgent and engine P1–P4).
const URGENCY: Record<string, number> = { urgent: 0, P1: 0, high: 1, P2: 1, medium: 2, P3: 2, low: 3, P4: 3 }
const urgency = (p: string) => URGENCY[p] ?? 5
const byDateThenUrgency = (a: SupplierTicketRow, b: SupplierTicketRow) =>
  (+new Date(b.createdAt) - +new Date(a.createdAt)) || (urgency(a.priority) - urgency(b.priority))

// Active tickets where evidence is required but the supplier hasn't uploaded the
// after photos + COC (before photos come from ticket logging, not the supplier).
const missingEvidence = (t: SupplierTicketRow) => t.active && t.evidenceRequired && !(t.afterUploaded && t.cocUploaded)

// Tint a store group's count badge by its most urgent active job (closed/declined
// jobs don't count) — shared with the RM/SM tabs via urgencyCountCls.
function groupCountCls(rows: SupplierTicketRow[]): string {
  const active = rows.filter(t => t.active && !t.declinedForMe)
  return urgencyCountCls(active.map(t => t.priority))
}

type FilterKey = 'breached' | 'overdue' | 'evidence' | 'declined' | 'cancelled' | Bucket
// Valid deep-link (?filter=) keys — the bucket keys plus the extra slices.
const SUPPLIER_FILTER_KEYS = new Set<string>(['to_quote', 'quoted', 'approved', 'scheduled', 'in_progress', 'signoff', 'completed', 'closed', 'breached', 'overdue', 'evidence', 'declined', 'cancelled'])

function milestone(t: SupplierTicketRow): { label: string; at: string } | null {
  // A declined supplier must never see the ticket's "Quote approved" (that was
  // another supplier) — show their own decline (or their last own milestone).
  if (t.declinedForMe) {
    // Milestone line reads a plain "Declined" (the badge carries the who).
    const declinedLabel = 'Declined'
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
  const sm = rmStatusMeta(myStatus(t))
  const m = milestone(t)
  // Dispute/declined force a red status badge; otherwise the rmStatusMeta class.
  const statusCls = t.declinedForMe || t.disputed ? 'bg-red-500/15 text-red-700 dark:text-red-400' : sm.cls
  const statusLabel = t.disputed ? 'Dispute' : t.declinedForMe ? (t.declinedBy === 'supplier' ? 'Declined (you)' : t.declinedBy === 'regional_manager' ? 'Declined (Client)' : 'Declined') : sm.label
  return (
    <Link href={`/supplier/tickets/${t.id}`} className="grid gap-3 border-b border-[var(--border)] px-2 py-3 last:border-0 transition hover:bg-[var(--hover)] sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <CategoryIcon category={t.category ?? t.title} priority={t.priority} className="h-11 w-11" iconSize={18} />
        <div className="min-w-0">
          {showStore && <p className="text-[10px] text-[var(--text-faint)] truncate">{t.isIndividual ? 'Individual' : [company, t.storeName].filter(Boolean).join(' · ')}</p>}
          <p className="truncate text-sm font-bold text-[var(--text)]">{t.title}</p>
          {m && <p className={`text-[11px] font-medium ${m.label.startsWith('Declined') ? 'text-red-600 dark:text-red-400' : sm.text}`}>{m.label} · {formatDateTime(m.at)}</p>}
        </div>
      </div>
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          <span className={`inline-flex w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${priorityBadgeClass(t as never)}`}>{priorityLabel(t as never)}</span>
          <span className={`inline-flex w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${statusCls}`}>{statusLabel}</span>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          {formatDateTime(t.createdAt)}
          {/* eslint-disable-next-line react-hooks/purity -- Date.now() drives a relative "overdue by" display; cosmetic elapsed-time readout, not a hydration-correctness concern */}
          {t.overdue && <span className="ml-1.5 font-semibold text-red-600 dark:text-red-400">· Overdue by {humanizeDuration(Date.now() - new Date(t.dueAt).getTime())}</span>}
        </p>
      </div>
    </Link>
  )
}

export function SupplierTickets({ tickets, quotes, company }: { tickets: SupplierTicketRow[]; quotes: SupplierQuoteRow[]; company: string }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<FilterKey | null>(null)
  // Store groups start collapsed; the set tracks which the user has expanded.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [panelStore, setPanelStore] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const s = params.get('store')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads window.location (client-only) after mount to apply deep-linked ?store=; cannot run during SSR render
    if (s) setPanelStore(s)
    const f = params.get('filter')
    if (f && SUPPLIER_FILTER_KEYS.has(f)) setFilter(f as FilterKey)
  }, [])

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { to_quote: 0, quoted: 0, approved: 0, scheduled: 0, in_progress: 0, signoff: 0, completed: 0, closed: 0 }
    // A ticket awarded to another supplier counts as closed (declined), not as this
    // supplier's completed/active work.
    for (const t of tickets) c[t.declinedForMe ? 'closed' : bucketOfRow(t)]++
    return c
  }, [tickets])
  // Distribution bar grouped by the four filter-intent tones (My actions → Awaiting
  // → Critical → Completed), coloured to the group headings and filled front-to-back
  // so "My actions" (amber) starts at the left where its heading sits. Closed/declined
  // is excluded; overdue/breached → Critical; to-quote or missing-evidence → My actions.
  const barSegs = useMemo(() => {
    const g = { mine: 0, awaiting: 0, critical: 0, done: 0 }
    for (const t of tickets) {
      if (t.declinedForMe || t.status === 'cancelled') continue
      const b = bucketOfRow(t)
      if (b === 'closed') continue
      if (t.overdue || t.breached) g.critical++
      else if (b === 'completed') g.done++
      else if (b === 'to_quote' || missingEvidence(t)) g.mine++
      else g.awaiting++
    }
    return [
      { key: 'mine', n: g.mine, cls: 'bg-amber-500' },
      { key: 'awaiting', n: g.awaiting, cls: 'bg-blue-500' },
      { key: 'critical', n: g.critical, cls: 'bg-red-500' },
      { key: 'done', n: g.done, cls: 'bg-emerald-500' },
    ]
  }, [tickets])
  const barTotal = barSegs.reduce((s, x) => s + x.n, 0) || 1
  // A supplier-side breach only counts while not yet fully overdue — once overdue
  // it moves to the Overdue pill (RM-side breaches never affect the supplier).
  const breachedCount = useMemo(() => tickets.filter(t => t.breached && !t.overdue).length, [tickets])
  const overdueCount = useMemo(() => tickets.filter(t => t.overdue).length, [tickets])
  const declinedCount = useMemo(() => tickets.filter(t => t.declinedForMe).length, [tickets])
  const cancelledCount = useMemo(() => tickets.filter(t => t.status === 'cancelled').length, [tickets])
  const evidenceCount = useMemo(() => tickets.filter(missingEvidence).length, [tickets])

  // Filters grouped by intent (My actions / Awaiting / Critical / Completed).
  const filterGroups: FilterGroup[] = useMemo(() => [
    { tone: 'mine', label: 'My actions (requiring response)', tiles: [
      { key: 'to_quote', label: 'Quote requested', count: counts.to_quote, icon: <ReceiptText size={16} /> },
      { key: 'evidence', label: 'Missing evidence', count: evidenceCount, icon: <Camera size={16} /> },
    ] },
    { tone: 'awaiting', label: 'Awaiting action (from others)', tiles: [
      { key: 'quoted', label: 'Quoted', count: counts.quoted, icon: <FileText size={16} /> },
      { key: 'approved', label: 'Quote approved', count: counts.approved, icon: <CheckCircle2 size={16} /> },
      { key: 'scheduled', label: 'Job scheduled', count: counts.scheduled, icon: <Calendar size={16} /> },
      { key: 'in_progress', label: 'In progress', count: counts.in_progress, icon: <Loader2 size={16} /> },
      { key: 'signoff', label: 'Sign-off', count: counts.signoff, icon: <ClipboardCheck size={16} /> },
    ] },
    { tone: 'critical', label: 'Critical & overdue', tiles: [
      { key: 'breached', label: 'SLA breached', count: breachedCount, icon: <AlertTriangle size={16} /> },
      { key: 'overdue', label: 'Overdue', count: overdueCount, icon: <Clock size={16} /> },
    ] },
    { tone: 'closed', label: 'Completed & closed', tiles: [
      { key: 'completed', label: 'Completed', count: counts.completed, icon: <CheckCircle2 size={16} /> },
      { key: 'declined', label: 'Declined', count: declinedCount, icon: <XCircle size={16} /> },
      { key: 'cancelled', label: 'Cancelled', count: cancelledCount, icon: <Ban size={16} /> },
    ] },
  ], [counts, breachedCount, overdueCount, declinedCount, cancelledCount, evidenceCount])

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return tickets.filter(t => {
      if (filter === 'breached') { if (!(t.breached && !t.overdue)) return false }
      else if (filter === 'overdue') { if (!t.overdue) return false }
      else if (filter === 'declined') { if (!t.declinedForMe) return false }
      else if (filter === 'cancelled') { if (t.status !== 'cancelled') return false }
      else if (filter === 'evidence') { if (!missingEvidence(t)) return false }
      else if (filter !== null && bucketOfRow(t) !== filter) return false
      // Tickets where this supplier was declined (and not re-invited) only show under Declined / Cancelled.
      if (filter !== 'declined' && filter !== 'cancelled' && t.declinedForMe) return false
      if (!terms.length) return true
      const hay = `${t.title} ${t.storeName} ${t.branchCode ?? ''} ${rmStatusMeta(myStatus(t)).label}`.toLowerCase()
      return terms.every(w => hay.includes(w))
    })
  }, [tickets, q, filter])

  // Under "All": breached pins to the top, completed drops into the Archive, the
  // rest groups by store. Everything is ordered newest → most urgent.
  const breachedRows = useMemo(() => filter === null ? shown.filter(t => t.breached && !t.overdue).sort(byDateThenUrgency) : [], [shown, filter])
  const liveShown = useMemo(() => (filter === null ? shown.filter(t => !(t.breached && !t.overdue) && bucketOfRow(t) !== 'completed') : shown).slice().sort(byDateThenUrgency), [shown, filter])
  const archived = useMemo(() => (filter === null ? shown.filter(t => bucketOfRow(t) === 'completed') : []).slice().sort(byDateThenUrgency), [shown, filter])
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [breachedOpen, setBreachedOpen] = useState(false)

  // Restore the expand/collapse state the user left (per-session; wiped on sign-in)
  // so navigating into a ticket and back keeps the lists exactly as they were.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restores persisted expand/collapse state from localStorage (client-only) after mount; cannot run during SSR render
    setExpanded(new Set(readCollapseSet('supplier-tickets-expanded')))
    setBreachedOpen(readCollapse('supplier-tickets-breached') ?? false)
    setArchiveOpen(readCollapse('supplier-tickets-archive') ?? false)
  }, [])

  const groups = useMemo(() => {
    const m = new Map<string, { branchCode: string | null; rows: SupplierTicketRow[] }>()
    for (const t of liveShown) { const g = m.get(t.storeName) ?? { branchCode: t.branchCode, rows: [] }; g.rows.push(t); m.set(t.storeName, g) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [liveShown])

  // Arriving from a dashboard KPI (?filter=…) auto-expands the lists so the tickets
  // are visible immediately — runs once, only for the deep-link (not manual clicks).
  const didAutoExpand = useRef(false)
  useEffect(() => {
    if (didAutoExpand.current || filter === null) return
    if (!new URLSearchParams(window.location.search).get('filter')) return
    didAutoExpand.current = true
    const names = groups.map(([s]) => s)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot auto-expand driven by a client-only URL query param (?filter); cannot run during SSR render
    setExpanded(new Set(names)); writeCollapseSet('supplier-tickets-expanded', names)
    setBreachedOpen(true); writeCollapse('supplier-tickets-breached', true)
    // The Archive (completed) stays collapsed on a KPI deep-link — only the live
    // lists open, so the tickets the KPI points at are what's visible.
  }, [filter, groups])

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

      {/* Distribution bar — four intent tones, filled front-to-back (My actions first). */}
      <Card className="p-4 space-y-2">
        <div className="h-3 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden flex">
          {barSegs.map(x => x.n > 0 && <div key={x.key} className={`h-full ${x.cls}`} style={{ width: `${Math.round((x.n / barTotal) * 100)}%` }} />)}
        </div>
      </Card>

      {/* Grouped filter badges — My actions / Awaiting / Critical / Completed. */}
      <TicketFilterTiles groups={filterGroups} active={filter} onPick={k => setFilter(f => (f === k ? null : (k as FilterKey)))} />

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
          {breachedOpen && <div className="px-1 mt-1" onClick={e => e.stopPropagation()}>{breachedRows.map(t => <TicketRow key={t.id} t={t} company={company} showStore />)}</div>}
        </Card>
      )}

      {/* Store groups */}
      {groups.map(([store, g]) => {
        const isCollapsed = !expanded.has(store)
        const groupIndividual = g.rows[0]?.isIndividual ?? false
        return (
          <Card key={store} className="p-3 cursor-pointer hover:ring-[#C6A35D]/30 transition" onClick={() => toggle(store)} role="button" tabIndex={0} aria-expanded={!isCollapsed} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(store) } }}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="flex items-center gap-2 min-w-0">
                <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
                <span className="text-sm font-bold text-[var(--text)] truncate">{groupIndividual ? 'Individual' : <>{[company, store].filter(Boolean).join(' · ')}{g.branchCode ? ` · ${g.branchCode}` : ''}</>}</span>
                <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 shrink-0 ${groupCountCls(g.rows)}`}>{g.rows.length}</span>
              </span>
              <button onClick={e => { e.stopPropagation(); setPanelStore(store) }} title="Store overview" className="shrink-0 -m-1 p-1.5 rounded-lg text-[var(--text-faint)] hover:text-blue-600 hover:bg-blue-500/10 transition"><BarChart3 size={16} /></button>
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
                const sm = rmStatusMeta(myStatus(t))
                return (
                  <Link key={t.id} href={`/supplier/tickets/${t.id}`} className="grid gap-3 border-b border-[var(--border)] px-2 py-3 last:border-0 transition hover:bg-[var(--hover)] sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <CategoryIcon category={t.category ?? t.title} priority={t.priority} className="h-11 w-11" iconSize={18} />
                      <div className="min-w-0">
                        <p className="text-[10px] text-[var(--text-faint)] truncate">{t.isIndividual ? 'Individual' : [company, t.storeName].filter(Boolean).join(' · ')}</p>
                        <p className="truncate text-sm font-bold text-[var(--text)]">{t.title}</p>
                        <p className="text-xs text-[var(--text-muted)]">{formatDateTime(t.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-1 sm:items-end">
                      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                        <span className={`inline-flex w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${priorityBadgeClass(t as never)}`}>{priorityLabel(t as never)}</span>
                        <span className={`inline-flex w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${sm.cls}`}>{sm.label}</span>
                      </div>
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
  for (const t of rows) c[bucketOfRow(t)]++
  const total = rows.length
  const panelIndividual = rows[0]?.isIndividual ?? false
  const barTotal = BAR_ORDER.reduce((s, b) => s + c[b], 0) || 1
  const active = rows.filter(t => t.active)
  const overdue = active.filter(t => t.breached).length
  const slaScore = active.length ? Math.round(100 * (active.length - overdue) / active.length) : 100
  const slaStatus = slaScore >= 80 ? 'controlled' : slaScore >= 60 ? 'attention' : slaScore >= 40 ? 'at_risk' : 'critical'

  // Quote acceptance + evidence completion.
  const decided = quotes.filter(qq => qq.status === 'accepted' || qq.status === 'declined')
  const acceptRate = decided.length ? Math.round(100 * decided.filter(qq => qq.status === 'accepted').length / decided.length) : null
  const evReq = active.filter(t => t.evidenceRequired)
  const evDone = evReq.filter(t => t.afterUploaded && t.cocUploaded).length
  const evRate = evReq.length ? Math.round(100 * evDone / evReq.length) : null

  const Stat = ({ label, value, tone = '' }: { label: string; value: number | string; tone?: string }) => (
    <div className="rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-3">
      <div className={`text-xl font-bold ${tone || 'text-[var(--text)]'}`}>{value}</div>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
    </div>
  )

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      {close => (
        <>
        <DrawerHeader onClose={close} title={
          <div className="min-w-0">
            {company && !panelIndividual && <p className="text-[10px] text-[var(--text-faint)] truncate">{company}</p>}
            <div className="flex items-center gap-2 flex-wrap">
              <Store size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
              <h3 className="text-lg font-bold text-[var(--text)]">{store}</h3>
              <span className="text-xs text-[var(--text-muted)]">{total} ticket{total === 1 ? '' : 's'}</span>
            </div>
          </div>
        } />

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
    </Modal>
  )
}
