'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PlusCircle, Search, Ticket, ChevronDown } from 'lucide-react'
import type { StoreManagerTicket } from '@/lib/health/data'
import { Card } from '@/components/exec/ui'
import { CategoryIcon, TicketBadges } from './ticketBadges'
import { readCollapse, writeCollapse } from '@/lib/collapse-state'
import { formatDate, formatDateTime, humanizeDuration, urgencyCountCls, OPERATIONAL_IMPACT_LABELS, PRIORITY_LEVEL_LABELS } from '@/lib/utils'

type Filter = 'all' | 'open' | 'info_requested' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'overdue'

const WORD: Record<string, string> = { open: 'New', info_requested: 'Info Requested', scheduled: 'Job scheduled', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }

// Urgency rank (handles classic low/medium/high/urgent and engine P1–P4).
const URGENCY: Record<string, number> = { urgent: 0, P1: 0, high: 1, P2: 1, medium: 2, P3: 2, low: 3, P4: 3 }
const urgency = (p: string) => URGENCY[p] ?? 5
// Newest first, then most urgent.
const byDateThenUrgency = (a: StoreManagerTicket, b: StoreManagerTicket) =>
  (+new Date(b.createdAt) - +new Date(a.createdAt)) || (urgency(a.priority) - urgency(b.priority))

// No "All" pill — the default (unselected) view is the collapsible status groups.
// Open leads; Overdue sits last. Clicking the active pill returns to the groups.
// Pills styled like the status/priority badges: tinted when inactive, filled when
// selected.
const PILLS: { key: Filter; label: string; active: string; inactive: string }[] = [
  { key: 'open',           label: 'New',           active: 'bg-blue-500 text-white',     inactive: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  { key: 'info_requested', label: 'Info Requested', active: 'bg-amber-500 text-white',    inactive: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  { key: 'scheduled',      label: 'Job scheduled', active: 'bg-indigo-500 text-white',    inactive: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400' },
  { key: 'in_progress',    label: 'In Progress',   active: 'bg-emerald-500 text-white',   inactive: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  { key: 'completed',      label: 'Completed',     active: 'bg-emerald-500 text-white',   inactive: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  { key: 'cancelled',      label: 'Cancelled',     active: 'bg-gray-500 text-white',      inactive: 'bg-gray-500/15 text-gray-600 dark:text-gray-400' },
  { key: 'overdue',        label: 'Overdue',       active: 'bg-red-600 text-white',       inactive: 'bg-red-500/15 text-red-600 dark:text-red-400' },
]

function Row({ t, storeName }: { t: StoreManagerTicket; storeName: string }) {
  return (
    <Link href={`/client/tickets/${t.id}`} className="grid gap-3 border-b border-[var(--border)] px-4 py-3 last:border-0 transition hover:bg-[var(--hover)] sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <CategoryIcon category={t.category ?? t.title} className="h-11 w-11" iconSize={18} />
        <div className="min-w-0">
          {t.jobRef && <p className="text-[10px] font-mono text-[var(--text-faint)]">{t.jobRef}</p>}
          <p className="truncate text-sm font-bold text-[var(--text)]">{t.category || t.title}</p>
          <p className="truncate text-xs text-[var(--text-muted)]">{storeName}</p>
        </div>
      </div>
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <TicketBadges ticket={t} />
        <p className="text-xs text-[var(--text-muted)]">{t.supplierAssigned ? 'Supplier assigned' : 'No supplier assigned'}</p>
        <p className="text-[11px] text-[var(--text-faint)]">
          {formatDateTime(t.createdAt)}
          {/* eslint-disable-next-line react-hooks/purity -- cosmetic "overdue by" readout, not hydration-critical */}
          {t.overdue && <span className="ml-1.5 font-semibold text-red-600 dark:text-red-400">· Overdue by {humanizeDuration(Date.now() - new Date(t.dueAt).getTime())}</span>}
        </p>
      </div>
    </Link>
  )
}

/** Collapsible status group used in the "All" view. */
function Group({ title, tickets, defaultOpen = false, storeName }: { title: string; tickets: StoreManagerTicket[]; defaultOpen?: boolean; storeName: string }) {
  const [open, setOpen] = useState(defaultOpen)
  // Remember the user's choice across navigation (wiped on next sign-in).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- restores persisted group open state from localStorage (client-only) when the title changes; cannot run during SSR render
  useEffect(() => { const v = readCollapse(`sm-group-${title}`); if (v !== null) setOpen(v) }, [title])
  const toggle = () => setOpen(o => { const v = !o; writeCollapse(`sm-group-${title}`, v); return v })
  if (!tickets.length) return null
  return (
    <Card className="p-2 cursor-pointer hover:ring-[#C6A35D]/30 transition" onClick={toggle} role="button" tabIndex={0} aria-expanded={open} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}>
      <div className="w-full flex items-center gap-2 px-2 py-2">
        <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
        <span className="text-sm font-bold text-[var(--text)]">{title}</span>
        <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${urgencyCountCls(tickets.filter(t => !['completed', 'cancelled'].includes(t.status)).map(t => t.priority))}`}>{tickets.length}</span>
      </div>
      {open && <div onClick={e => e.stopPropagation()}>{tickets.map(t => <Row key={t.id} t={t} storeName={storeName} />)}</div>}
    </Card>
  )
}

export function StoreTicketsList({ tickets, initialFilter = 'all', storeName = 'Your store' }: { tickets: StoreManagerTicket[]; initialFilter?: Filter; storeName?: string }) {
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [q, setQ] = useState('')

  const counts = useMemo(() => {
    const c = { open: 0, info_requested: 0, scheduled: 0, in_progress: 0, completed: 0, cancelled: 0, overdue: 0 }
    for (const t of tickets) { if (t.status in c) (c as any)[t.status]++; if (t.overdue) c.overdue++ }
    return c
  }, [tickets])

  // Lowercase haystack per ticket covering every searchable field.
  const haystacks = useMemo(() => tickets.map(t => ({
    t,
    hay: [
      t.title,
      t.description ?? '',
      t.category ?? 'General',
      WORD[t.status] ?? '', t.status,
      t.priority, PRIORITY_LEVEL_LABELS[t.priority] ?? '',
      t.operationalImpact ? (OPERATIONAL_IMPACT_LABELS[t.operationalImpact] ?? t.operationalImpact) : '',
      t.operationalImpact ?? '',
      t.jobRef ?? '',
      formatDate(t.createdAt), formatDateTime(t.createdAt),
      t.supplierAssigned ? 'supplier assigned' : '',
    ].join(' · ').toLowerCase(),
  })), [tickets])

  // Multi-token AND search: every token must match.
  const shown = useMemo(() => {
    const tokens = q.toLowerCase().split(/[\s+]+/).map(s => s.trim()).filter(Boolean)
    return haystacks
      .filter(({ t, hay }) =>
        (filter === 'all'
          || (filter === 'overdue' ? t.overdue
            // "Open" is an umbrella of every active ticket (not completed/cancelled),
            // so a ticket stays under Open until it's completed.
            : filter === 'open' ? !['completed', 'cancelled'].includes(t.status)
            : t.status === filter)) &&
        (tokens.length === 0 || tokens.every(tok => hay.includes(tok))))
      .map(x => x.t)
  }, [haystacks, filter, q])

  // "All" view: every ticket in one list (newest → urgency), shown under a single
  // "All Tickets" collapsible. A specific filter → the same flat list, filtered.
  const shownSorted = useMemo(() => [...shown].sort(byDateThenUrgency), [shown])

  // Distribution bar excludes cancelled (live work only).
  const barTotal = counts.open + counts.scheduled + counts.in_progress + counts.completed || 1
  const barPct = (n: number) => Math.round((n / barTotal) * 100)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Ticket className="text-blue-600 dark:text-blue-400" size={22} /> Tickets</h1>
        </div>
        <Link href="/client/tickets/new" className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition shrink-0"><PlusCircle size={16} /> Log a Ticket</Link>
      </div>

      {/* Distribution bar */}
      <Card className="p-4 space-y-2">
        <div className="h-3 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden flex">
          {counts.open > 0 && <div className="h-full bg-blue-500" style={{ width: `${barPct(counts.open)}%` }} />}
          {counts.scheduled > 0 && <div className="h-full bg-indigo-500" style={{ width: `${barPct(counts.scheduled)}%` }} />}
          {counts.in_progress > 0 && <div className="h-full bg-emerald-500" style={{ width: `${barPct(counts.in_progress)}%` }} />}
          {counts.completed > 0 && <div className="h-full bg-emerald-500" style={{ width: `${barPct(counts.completed)}%` }} />}
        </div>
      </Card>

      {/* Filter pills — above the search */}
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {PILLS.map(p => {
          const n = p.key === 'all' ? tickets.length : (counts as any)[p.key]
          const on = filter === p.key
          return (
            <button key={p.key} onClick={() => setFilter(f => f === p.key ? 'all' : p.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition text-center ${on ? p.active : p.inactive}`}>
              {p.label} <span className="opacity-70">{n}</span>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tickets…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] focus:ring-[#C6A35D]/40 outline-none" />
      </div>

      {/* All → every ticket under one collapsible "All Tickets" heading (newest →
          most urgent), open by default with its state remembered until sign-out.
          A specific filter → flat list. */}
      {filter === 'all' ? (
        shown.length ? (
          <Group title="All Tickets" tickets={shownSorted} defaultOpen storeName={storeName} />
        ) : (
          <Card className="p-2"><p className="text-sm text-[var(--text-faint)] text-center py-8">{tickets.length ? 'No tickets match.' : 'No tickets yet.'}</p></Card>
        )
      ) : (
        <Card className="p-2">
          {shownSorted.map(t => <Row key={t.id} t={t} storeName={storeName} />)}
          {!shownSorted.length && <p className="text-sm text-[var(--text-faint)] text-center py-8">{tickets.length ? 'No tickets match.' : 'No tickets yet.'}</p>}
        </Card>
      )}
    </div>
  )
}
