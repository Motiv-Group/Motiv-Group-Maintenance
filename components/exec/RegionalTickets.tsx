'use client'

// RM Tickets tab — SM-style controls (search, filters, distribution bar),
// collapsible store groups, and a slide-out store panel (chart + key counts).
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Ticket, Search, ChevronDown, BarChart3, X, PlusCircle } from 'lucide-react'
import type { RegionalTicketRow } from '@/lib/health/data'
import { Card } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { rmStatusMeta, formatDateTime } from '@/lib/utils'

type Bucket = 'open' | 'quoting' | 'in_progress' | 'completed' | 'cancelled'
function bucketOf(s: string): Bucket {
  if (s === 'open' || s === 'info_requested') return 'open'
  if (['assigned', 'quote_requested', 'assessment', 'quoted', 'quote_revision'].includes(s)) return 'quoting'
  if (s === 'completed') return 'completed'
  if (s === 'cancelled' || s === 'declined') return 'cancelled'
  return 'in_progress'
}
const BUCKET_LABEL: Record<Bucket, string> = { open: 'Open', quoting: 'Quoting', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }
const BUCKET_BAR: Record<Bucket, string> = { open: 'bg-blue-500', quoting: 'bg-violet-500', in_progress: 'bg-[#C6A35D]', completed: 'bg-emerald-500', cancelled: 'bg-red-500' }

const PILLS: { key: 'all' | Bucket; label: string; active: string; inactive: string }[] = [
  { key: 'all', label: 'All', active: 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-[#0a0e17] dark:border-white', inactive: 'text-[var(--text-muted)] border-[var(--border)] hover:border-slate-400' },
  { key: 'open', label: 'Open', active: 'bg-blue-500 text-white border-blue-500', inactive: 'text-blue-600 dark:text-blue-400 border-blue-500/40 hover:border-blue-400' },
  { key: 'quoting', label: 'Quoting', active: 'bg-violet-500 text-white border-violet-500', inactive: 'text-violet-600 dark:text-violet-400 border-violet-500/40 hover:border-violet-400' },
  { key: 'in_progress', label: 'In Progress', active: 'bg-[#C6A35D] text-[#0a0e17] border-[#C6A35D]', inactive: 'text-amber-600 dark:text-[#C6A35D] border-[#C6A35D]/40 hover:border-[#C6A35D]' },
  { key: 'completed', label: 'Completed', active: 'bg-emerald-500 text-white border-emerald-500', inactive: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 hover:border-emerald-400' },
  { key: 'cancelled', label: 'Cancelled', active: 'bg-red-500 text-white border-red-500', inactive: 'text-red-600 dark:text-red-400 border-red-500/40 hover:border-red-400' },
]

function TicketRow({ t }: { t: RegionalTicketRow }) {
  const sm = rmStatusMeta(t.status)
  return (
    <Link href={`/regional/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2.5 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
      <div className="min-w-0">
        {t.jobRef && <p className="text-[10px] font-mono text-[var(--text-faint)]">{t.jobRef}</p>}
        <p className="text-sm text-[var(--text)] truncate">{t.title}</p>
        <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(t.createdAt)}{t.breached ? ' · ⚠ breached' : ''}</p>
        {t.quoteRequestedAt && <p className="text-[11px] text-[var(--text-faint)]">Quote requested · {formatDateTime(t.quoteRequestedAt)}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_7rem] gap-1.5 shrink-0 justify-items-end sm:justify-items-stretch">
        <PriorityBadge priority={t.priority} className="w-full text-center" />
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${sm.cls}`}>{sm.label}</span>
      </div>
    </Link>
  )
}

export function RegionalTickets({ tickets }: { tickets: RegionalTicketRow[] }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | Bucket>('all')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [panelStore, setPanelStore] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { open: 0, quoting: 0, in_progress: 0, completed: 0, cancelled: 0 }
    for (const t of tickets) c[bucketOf(t.status)]++
    return c
  }, [tickets])
  const barTotal = counts.open + counts.quoting + counts.in_progress + counts.completed || 1

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return tickets.filter(t => {
      if (filter !== 'all' && bucketOf(t.status) !== filter) return false
      if (!terms.length) return true
      const hay = `${t.title} ${t.storeName} ${t.branchCode ?? ''} ${t.jobRef ?? ''} ${rmStatusMeta(t.status).label}`.toLowerCase()
      return terms.every(w => hay.includes(w))
    })
  }, [tickets, q, filter])

  const groups = useMemo(() => {
    const m = new Map<string, { branchCode: string | null; rows: RegionalTicketRow[] }>()
    for (const t of shown) { const g = m.get(t.storeName) ?? { branchCode: t.branchCode, rows: [] }; g.rows.push(t); m.set(t.storeName, g) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [shown])

  const toggle = (s: string) => setCollapsed(c => { const n = new Set(c); n.has(s) ? n.delete(s) : n.add(s); return n })
  const panelRows = useMemo(() => panelStore ? tickets.filter(t => t.storeName === panelStore) : [], [tickets, panelStore])

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
          {(['open', 'quoting', 'in_progress', 'completed'] as Bucket[]).map(b => counts[b] > 0 && (
            <div key={b} className={`h-full ${BUCKET_BAR[b]}`} style={{ width: `${Math.round((counts[b] / barTotal) * 100)}%` }} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:flex sm:flex-wrap">
          {(['open', 'quoting', 'in_progress', 'completed'] as Bucket[]).map(b => (
            <span key={b} className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className={`w-2 h-2 rounded-full ${BUCKET_BAR[b]}`} />{BUCKET_LABEL[b]} {counts[b]}</span>
          ))}
          {counts.cancelled > 0 && <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className="w-2 h-2 rounded-full bg-red-500" />Cancelled {counts.cancelled}</span>}
        </div>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search title, store, status, job ID…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] outline-none focus:ring-[#C6A35D]/40" />
      </div>

      {/* Filter pills */}
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {PILLS.map(p => {
          const n = p.key === 'all' ? tickets.length : counts[p.key]
          const on = filter === p.key
          return (
            <button key={p.key} onClick={() => setFilter(p.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition text-center ${on ? p.active : p.inactive}`}>
              {p.label} <span className="opacity-70">{n}</span>
            </button>
          )
        })}
      </div>

      {/* Store groups (collapsible; tap name for the side panel) */}
      {groups.map(([store, g]) => {
        const isCollapsed = collapsed.has(store)
        return (
          <Card key={store} className="p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <button onClick={() => toggle(store)} aria-expanded={!isCollapsed} className="flex items-center gap-2 min-w-0 -m-1 p-1 rounded-lg hover:bg-[var(--hover)] transition">
                <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                <span className="text-sm font-bold text-[var(--text)] truncate">{store}{g.branchCode ? ` · ${g.branchCode}` : ''}</span>
                <span className="text-[11px] font-medium text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5">{g.rows.length}</span>
              </button>
              <button onClick={() => setPanelStore(store)} title="Store overview" className="shrink-0 -m-1 p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[#C6A35D] hover:bg-[#C6A35D]/10 transition"><BarChart3 size={16} /></button>
            </div>
            {!isCollapsed && <div className="px-1">{g.rows.map(t => <TicketRow key={t.id} t={t} />)}</div>}
          </Card>
        )
      })}
      {!groups.length && <Card className="p-5"><p className="text-sm text-[var(--text-faint)] text-center">No tickets match.</p></Card>}

      {panelStore && <StorePanel store={panelStore} rows={panelRows} onClose={() => setPanelStore(null)} />}
    </div>
  )
}

function StorePanel({ store, rows, onClose }: { store: string; rows: RegionalTicketRow[]; onClose: () => void }) {
  const c: Record<Bucket, number> = { open: 0, quoting: 0, in_progress: 0, completed: 0, cancelled: 0 }
  for (const t of rows) c[bucketOf(t.status)]++
  const total = rows.length
  const barTotal = c.open + c.quoting + c.in_progress + c.completed || 1
  const breached = rows.filter(t => t.breached).length
  const active = rows.filter(t => { const b = bucketOf(t.status); return b !== 'completed' && b !== 'cancelled' })
  const oldest = active.length ? Math.max(...active.map(t => Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86_400_000))) : 0

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

        {/* status breakdown chart */}
        <div className="space-y-2">
          <div className="h-3 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden flex">
            {(['open', 'quoting', 'in_progress', 'completed'] as Bucket[]).map(b => c[b] > 0 && <div key={b} className={`h-full ${BUCKET_BAR[b]}`} style={{ width: `${Math.round((c[b] / barTotal) * 100)}%` }} />)}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {(['open', 'quoting', 'in_progress', 'completed', 'cancelled'] as Bucket[]).map(b => c[b] > 0 && (
              <span key={b} className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className={`w-2 h-2 rounded-full ${BUCKET_BAR[b]}`} />{BUCKET_LABEL[b]} {c[b]}</span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Total" value={total} />
          <Stat label="Breached" value={breached} tone={breached ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'} />
          <Stat label="Open / Quoting" value={c.open + c.quoting} />
          <Stat label="In progress" value={c.in_progress} />
          <Stat label="Completed" value={c.completed} />
          <Stat label="Oldest open" value={`${oldest}d`} tone={oldest >= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--text)]'} />
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Tickets</div>
          {rows.map(t => <TicketRow key={t.id} t={t} />)}
        </div>
      </div>
    </div>
  )
}
