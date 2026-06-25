'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { PlusCircle, Search, Ticket } from 'lucide-react'
import type { StoreManagerTicket } from '@/lib/health/data'
import { Card } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { formatDate, formatDateTime, OPERATIONAL_IMPACT_LABELS, PRIORITY_LEVEL_LABELS } from '@/lib/utils'

type Filter = 'all' | 'open' | 'in_progress' | 'completed' | 'cancelled'

const TONE: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  in_progress: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D]',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  cancelled: 'bg-gray-500/15 text-gray-600 dark:text-gray-400',
}
const WORD: Record<string, string> = { open: 'Open', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }

const PILLS: { key: Filter; label: string; active: string; inactive: string }[] = [
  { key: 'all',         label: 'All',         active: 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-[#0a0e17] dark:border-white', inactive: 'text-[var(--text-muted)] border-[var(--border)] hover:border-slate-400' },
  { key: 'open',        label: 'Open',        active: 'bg-blue-500 text-white border-blue-500',              inactive: 'text-blue-600 dark:text-blue-400 border-blue-500/40 hover:border-blue-400' },
  { key: 'in_progress', label: 'In Progress', active: 'bg-[#C6A35D] text-[#0a0e17] border-[#C6A35D]',        inactive: 'text-amber-600 dark:text-[#C6A35D] border-[#C6A35D]/40 hover:border-[#C6A35D]' },
  { key: 'completed',   label: 'Completed',   active: 'bg-emerald-500 text-white border-emerald-500',        inactive: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 hover:border-emerald-400' },
  { key: 'cancelled',   label: 'Cancelled',   active: 'bg-red-500 text-white border-red-500',                inactive: 'text-red-600 dark:text-red-400 border-red-500/40 hover:border-red-400' },
]

export function StoreTicketsList({ tickets, initialFilter = 'all' }: { tickets: StoreManagerTicket[]; initialFilter?: Filter }) {
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [q, setQ] = useState('')

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, completed: 0, cancelled: 0 }
    for (const t of tickets) if (t.status in c) (c as any)[t.status]++
    return c
  }, [tickets])
  const total = tickets.length || 1

  // Build one lowercase haystack per ticket covering every field a manager
  // might type: title, description, category, status (friendly + raw),
  // priority (label + P1–P4 alias), operational impact, and the date.
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

  // Multi-token AND search: split on spaces and "+", every token must match.
  const shown = useMemo(() => {
    const tokens = q.toLowerCase().split(/[\s+]+/).map(s => s.trim()).filter(Boolean)
    return haystacks
      .filter(({ t, hay }) =>
        (filter === 'all' || t.status === filter) &&
        (tokens.length === 0 || tokens.every(tok => hay.includes(tok))))
      .map(x => x.t)
  }, [haystacks, filter, q])

  const pct = (n: number) => Math.round((n / total) * 100)
  // Distribution bar excludes cancelled (shown as its own red filter, not in the bar).
  const barTotal = counts.open + counts.in_progress + counts.completed || 1
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
          {counts.in_progress > 0 && <div className="h-full bg-[#C6A35D]" style={{ width: `${barPct(counts.in_progress)}%` }} />}
          {counts.completed > 0 && <div className="h-full bg-emerald-500" style={{ width: `${barPct(counts.completed)}%` }} />}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:flex sm:flex-wrap">
          <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className="w-2 h-2 rounded-full bg-blue-500" />Open {counts.open} ({barPct(counts.open)}%)</span>
          <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className="w-2 h-2 rounded-full bg-[#C6A35D]" />In Progress {counts.in_progress} ({barPct(counts.in_progress)}%)</span>
          <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className="w-2 h-2 rounded-full bg-emerald-500" />Completed {counts.completed} ({barPct(counts.completed)}%)</span>
          {counts.cancelled > 0 && <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className="w-2 h-2 rounded-full bg-red-500" />Cancelled {counts.cancelled}</span>}
        </div>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tickets…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] focus:ring-[#C6A35D]/40 outline-none" />
      </div>

      {/* Filter pills — 3-col grid on phone, inline on larger screens */}
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {PILLS.map(p => {
          const n = p.key === 'all' ? tickets.length : (counts as any)[p.key]
          const on = filter === p.key
          return (
            <button key={p.key} onClick={() => setFilter(p.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition text-center ${on ? p.active : p.inactive}`}>
              {p.label} <span className="opacity-70">{n}</span>
            </button>
          )
        })}
      </div>

      <Card className="p-2">
        {shown.map(t => (
          <Link key={t.id} href={`/client/tickets/${t.id}`} className="flex items-center justify-between gap-2 px-3 py-3 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
            <div className="min-w-0">
              {t.jobRef && <p className="text-[10px] font-mono text-[var(--text-faint)]">{t.jobRef}</p>}
              <p className="text-sm text-[var(--text)] truncate">{t.title}</p>
              <p className="text-[11px] text-[var(--text-faint)]">{t.category ?? 'General'} · {formatDateTime(t.createdAt)}{t.supplierAssigned ? ' · Supplier assigned' : ''}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_6rem] gap-1.5 shrink-0 justify-items-end sm:justify-items-stretch">
              <PriorityBadge priority={t.priority} className="w-full text-center" />
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${TONE[t.status]}`}>{WORD[t.status]}</span>
            </div>
          </Link>
        ))}
        {!shown.length && <p className="text-sm text-[var(--text-faint)] text-center py-8">{tickets.length ? 'No tickets match.' : 'No tickets yet.'}</p>}
      </Card>
    </div>
  )
}
