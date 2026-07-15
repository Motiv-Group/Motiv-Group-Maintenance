'use client'

// RM Snags page — snags raised across the region, mirroring the supplier Snags
// page but from the manager's side: stat cards (Open / Awaiting supplier / Under
// dispute / To review) filter a store-grouped list, each snag card carrying the
// reason, timing and a phase-aware action (Review dispute / Sign off / View).
import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ChevronLeft, Search, Store, X, HelpCircle, Calendar, Clock, Tag, MessageSquareWarning, Truck } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { CategoryIcon, priorityBadgeClass, priorityLabel } from '@/components/client/ticketBadges'
import { formatDateTime, humanizeDuration } from '@/lib/utils'

export interface RegionalSnagRow {
  id: string; storeName: string; branchCode: string | null; category: string | null; title: string
  priority: string; status: string; jobRef: string | null; description: string | null
  createdAt: string; dueAt: string | null; disputed: boolean; snagReason: string | null; supplier: string | null
}

type Phase = 'awaiting' | 'dispute' | 'review'
const prioTicket = (p: string) => ({ priority: p } as unknown as Parameters<typeof priorityBadgeClass>[0])

function phaseOf(t: RegionalSnagRow): Phase {
  if (t.disputed) return 'dispute'
  if (t.status === 'snag_resolved') return 'review'
  return 'awaiting'
}
const PHASE_META: Record<Phase, { label: string; badge: string; store: string }> = {
  awaiting: { label: 'Awaiting supplier', badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',        store: 'text-blue-600 dark:text-blue-400' },
  dispute:  { label: 'Under dispute',     badge: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',   store: 'text-violet-600 dark:text-violet-400' },
  review:   { label: 'To review',         badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',      store: 'text-amber-600 dark:text-amber-400' },
}

function StatCard({ icon, tone, value, title, sub, active, onClick }: { icon: ReactNode; tone: string; value: number; title: string; sub: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`flex items-center gap-3 rounded-xl bg-[var(--surface)] p-4 text-left ring-1 transition hover:bg-[var(--hover)] ${active ? 'ring-2 ring-[#C6A35D]/50' : 'ring-[var(--border)]'}`}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-none text-[var(--text)]">{value}</span>
        <span className="mt-1 block text-sm font-semibold text-[var(--text)]">{title}</span>
        <span className="block text-[11px] text-[var(--text-muted)]">{sub}</span>
      </span>
    </button>
  )
}

function Select<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <label className="relative flex min-w-[150px] flex-1 items-center gap-1.5 rounded-xl bg-[var(--input-bg)] px-3 py-2.5 text-sm ring-1 ring-[var(--border)] transition focus-within:ring-[#C6A35D]/40 sm:flex-none">
      <span className="whitespace-nowrap text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value as T)} className="w-full cursor-pointer appearance-none bg-transparent pr-4 font-semibold text-[var(--text)] outline-none">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-[var(--text-faint)]" />
    </label>
  )
}

const PRANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 }
const PER_PAGE = 10

export function RegionalSnags({ snags, generatedAt }: { snags: RegionalSnagRow[]; generatedAt: string }) {
  const nowMs = new Date(generatedAt).getTime()
  const [q, setQ] = useState('')
  const [store, setStore] = useState('all')
  const [statusF, setStatusF] = useState<'all' | Phase>('all')
  const [priorityF, setPriorityF] = useState('all')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'urgent'>('urgent')
  const [page, setPage] = useState(1)
  const [helpOpen, setHelpOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const storeNames = useMemo(() => [...new Set(snags.map(s => s.storeName))].sort((a, b) => a.localeCompare(b)), [snags])
  const stats = useMemo(() => {
    const c = { awaiting: 0, dispute: 0, review: 0 }
    for (const t of snags) c[phaseOf(t)]++
    return c
  }, [snags])

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return snags.filter(t => {
      if (store !== 'all' && t.storeName !== store) return false
      if (statusF !== 'all' && phaseOf(t) !== statusF) return false
      if (priorityF !== 'all' && String(t.priority) !== priorityF) return false
      if (terms.length) { const hay = `${t.category ?? ''} ${t.title} ${t.storeName} ${t.jobRef ?? ''} ${t.supplier ?? ''}`.toLowerCase(); if (!terms.every(w => hay.includes(w))) return false }
      return true
    }).sort((a, b) => sort === 'urgent'
      ? (PRANK[String(a.priority)] ?? 9) - (PRANK[String(b.priority)] ?? 9) || +new Date(b.createdAt) - +new Date(a.createdAt)
      : sort === 'newest' ? +new Date(b.createdAt) - +new Date(a.createdAt) : +new Date(a.createdAt) - +new Date(b.createdAt))
  }, [snags, q, store, statusF, priorityF, sort])

  const groups = useMemo(() => {
    const m = new Map<string, { branchCode: string | null; rows: RegionalSnagRow[] }>()
    for (const t of shown) { const g = m.get(t.storeName) ?? { branchCode: t.branchCode, rows: [] }; g.rows.push(t); m.set(t.storeName, g) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [shown])

  const totalPages = Math.max(1, Math.ceil(groups.length / PER_PAGE))
  const cur = Math.min(page, totalPages)
  const pageGroups = groups.slice((cur - 1) * PER_PAGE, cur * PER_PAGE)
  const firstShown = groups.length ? (cur - 1) * PER_PAGE + 1 : 0
  const lastShown = Math.min(cur * PER_PAGE, groups.length)

  const toggle = (s: string) => setCollapsed(c => { const n = new Set(c); n.has(s) ? n.delete(s) : n.add(s); return n })
  const clear = () => { setQ(''); setStore('all'); setStatusF('all'); setPriorityF('all'); setSort('urgent'); setPage(1) }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]"><AlertTriangle className="text-amber-600 dark:text-amber-500" size={22} /> Snags</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">Snags raised across your region — track the corrective work and sign off the fix.</p>
        </div>
        <button type="button" onClick={() => setHelpOpen(o => !o)} className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-blue-600 transition hover:underline dark:text-blue-400"><HelpCircle size={15} /> How snags work</button>
      </div>

      {helpOpen && (
        <Card className="p-4 text-sm text-[var(--text-muted)]">
          <p>Raise a <span className="font-semibold text-amber-600 dark:text-amber-400">snag</span> when a completion isn&apos;t up to standard. The supplier accepts it and schedules the fix, then re-submits for you to <span className="font-semibold text-emerald-600 dark:text-emerald-400">sign off</span>. If the supplier disagrees they raise a <span className="font-semibold text-violet-600 dark:text-violet-400">dispute</span> for you to resolve.</p>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<span className="grid h-11 w-11 place-items-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400"><AlertOctagon size={20} /></span>} tone="border-red-500" value={snags.length} title="Open snags" sub="Across your region" active={statusF === 'all'} onClick={() => { setStatusF('all'); setPage(1) }} />
        <StatCard icon={<span className="grid h-11 w-11 place-items-center rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400"><Clock size={20} /></span>} tone="border-blue-500" value={stats.awaiting} title="Awaiting supplier" sub="Fix in progress" active={statusF === 'awaiting'} onClick={() => { setStatusF(f => f === 'awaiting' ? 'all' : 'awaiting'); setPage(1) }} />
        <StatCard icon={<span className="grid h-11 w-11 place-items-center rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400"><MessageSquareWarning size={20} /></span>} tone="border-violet-500" value={stats.dispute} title="Under dispute" sub="Needs your review" active={statusF === 'dispute'} onClick={() => { setStatusF(f => f === 'dispute' ? 'all' : 'dispute'); setPage(1) }} />
        <StatCard icon={<span className="grid h-11 w-11 place-items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"><CheckCircle2 size={20} /></span>} tone="border-amber-500" value={stats.review} title="To review" sub="Re-submitted — sign off" active={statusF === 'review'} onClick={() => { setStatusF(f => f === 'review' ? 'all' : 'review'); setPage(1) }} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="Search snags by store, supplier, ticket ID or title…" className="w-full rounded-xl bg-[var(--input-bg)] py-2.5 pl-9 pr-3 text-sm text-[var(--text)] ring-1 ring-[var(--border)] outline-none placeholder-[var(--text-faint)] focus:ring-[#C6A35D]/40" />
        </div>
        <Select label="Store" value={store} onChange={v => { setStore(v); setPage(1) }} options={[{ value: 'all', label: 'All stores' }, ...storeNames.map(s => ({ value: s, label: s }))]} />
        <Select label="Status" value={statusF} onChange={v => { setStatusF(v); setPage(1) }} options={[{ value: 'all', label: 'All statuses' }, { value: 'awaiting', label: 'Awaiting supplier' }, { value: 'dispute', label: 'Under dispute' }, { value: 'review', label: 'To review' }]} />
        <Select label="Priority" value={priorityF} onChange={v => { setPriorityF(v); setPage(1) }} options={[{ value: 'all', label: 'All priorities' }, { value: 'P1', label: 'Critical' }, { value: 'P2', label: 'High' }, { value: 'P3', label: 'Medium' }, { value: 'P4', label: 'Low' }]} />
        <Select label="Sort by" value={sort} onChange={setSort} options={[{ value: 'urgent', label: 'Most urgent' }, { value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }]} />
        <button type="button" onClick={clear} className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]"><X size={15} /> Clear filters</button>
      </div>

      {!groups.length && (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
          <AlertTriangle size={28} className="mx-auto mb-2 text-[var(--text-faint)]" />
          <p className="text-sm text-[var(--text-faint)]">{snags.length ? 'No snags match your filters.' : 'No open snags in your region.'}</p>
        </div>
      )}

      {/* Store groups */}
      {pageGroups.map(([storeName, g]) => {
        const open = !collapsed.has(storeName)
        const top = [...g.rows].sort((a, b) => (PRANK[String(a.priority)] ?? 9) - (PRANK[String(b.priority)] ?? 9))[0]
        const phase = phaseOf(top)
        const meta = PHASE_META[phase]
        const due = top.dueAt ? new Date(top.dueAt).getTime() - nowMs : null
        const summary = phase === 'dispute' ? 'Under dispute — review'
          : phase === 'review' ? 'Re-submitted — sign off'
          : `Awaiting supplier${due != null ? `: Next deadline ${due <= 0 ? 'overdue' : `in ${humanizeDuration(due)}`}` : ''}`
        return (
          <div key={storeName} className="overflow-hidden rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)]">
            <div role="button" tabIndex={0} aria-expanded={open} onClick={() => toggle(storeName)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(storeName) } }} className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-[var(--hover)]">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--surface-2)] text-[var(--text-muted)]"><Store size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2"><span className="truncate text-base font-bold text-[var(--text)]">{storeName}</span>{g.branchCode && <span className="shrink-0 text-sm text-[var(--text-muted)]">· {g.branchCode}</span>}</span>
                <span className="text-[11px] text-[var(--text-muted)]">{g.rows.length} snag{g.rows.length === 1 ? '' : 's'} · <span className={`font-semibold ${meta.store}`}>{summary}</span></span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.badge}`}>{g.rows.length} {phase === 'dispute' ? 'under dispute' : phase === 'review' ? 'to review' : 'open'}</span>
              <ChevronDown size={18} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>
            {open && (
              <div className="border-t border-[var(--border)]">
                {g.rows.map(t => {
                  const p = phaseOf(t)
                  const pm = PHASE_META[p]
                  const rDue = t.dueAt ? new Date(t.dueAt).getTime() - nowMs : null
                  return (
                    <div key={t.id} className="border-b border-[var(--border)] px-4 py-4 last:border-b-0">
                      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr_1.3fr_auto]">
                        <div className="flex min-w-0 items-start gap-3">
                          <CategoryIcon category={t.category ?? t.title} priority={t.priority} className="h-11 w-11" iconSize={18} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-[var(--text)]">{t.category || t.title}</p>
                            {t.jobRef && <Link href={`/regional/tickets/${t.id}`} className="block truncate text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400">Ticket {t.jobRef}</Link>}
                            {t.supplier && <p className="flex items-center gap-1 truncate text-[11px] text-[var(--text-muted)]"><Truck size={11} className="shrink-0" /> {t.supplier}</p>}
                            {t.description && <p className="mt-0.5 line-clamp-2 text-sm text-[var(--text-muted)]">{t.description}</p>}
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${priorityBadgeClass(prioTicket(String(t.priority)))}`}>{priorityLabel(prioTicket(String(t.priority)))}</span>
                              <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${pm.badge}`}>{pm.label}</span>
                            </div>
                          </div>
                        </div>
                        <div className="min-w-0 space-y-1.5 text-sm">
                          <div><p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Raised</p><p className="flex items-center gap-1.5 text-[var(--text)]"><Calendar size={13} className="shrink-0 text-[var(--text-faint)]" /> {formatDateTime(t.createdAt)}</p></div>
                          {t.dueAt && <div><p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Fix due</p><p className="flex items-center gap-1.5 text-[var(--text)]"><Clock size={13} className="shrink-0 text-[var(--text-faint)]" /> {formatDateTime(t.dueAt)}</p>{rDue != null && <p className={`text-[11px] font-semibold ${rDue <= 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>{rDue <= 0 ? 'overdue' : `in ${humanizeDuration(rDue)}`}</p>}</div>}
                          {t.category && <div><p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Category</p><p className="flex items-center gap-1.5 text-[var(--text)]"><Tag size={13} className="shrink-0 text-[var(--text-faint)]" /> {t.category}</p></div>}
                        </div>
                        <div className="min-w-0">
                          {t.snagReason ? (<><p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Reason</p><p className="text-sm text-[var(--text)]">{t.snagReason}</p></>) : <p className="text-sm text-[var(--text-faint)]">Open the ticket for the full snag detail.</p>}
                        </div>
                        <div className="flex flex-col items-stretch justify-center gap-2 lg:w-40">
                          <Link href={`/regional/tickets/${t.id}`} className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white transition ${p === 'dispute' ? 'bg-violet-600 hover:bg-violet-500' : p === 'review' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-blue-600 hover:bg-blue-500'}`}>{p === 'dispute' ? 'Review dispute' : p === 'review' ? 'Sign off' : 'View'} <ChevronRight size={15} /></Link>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Pagination */}
      {groups.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-sm text-[var(--text-muted)]">Showing {firstShown} to {lastShown} of {groups.length} store{groups.length === 1 ? '' : 's'}</p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={cur <= 1} aria-label="Previous page" className="rounded-lg p-1.5 text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-40"><ChevronLeft size={15} /></button>
              <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-blue-600 px-2 text-sm font-semibold text-white">{cur}</span>
              <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={cur >= totalPages} aria-label="Next page" className="rounded-lg p-1.5 text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-40"><ChevronRight size={15} /></button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
