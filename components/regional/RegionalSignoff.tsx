'use client'

// RM Sign-off page — completion submissions awaiting the manager's review, mirroring
// the supplier Sign-off tab: stat cards (Awaiting review / Evidence pending / Total)
// filter a store-grouped list, each submission carrying the supplier, what was sent,
// and a "Review & sign off" action.
import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ClipboardCheck, Clock, CheckCircle2, ChevronDown, ChevronRight, ChevronLeft, Search, Store, X, Image as ImageIcon, FileText, HelpCircle, Calendar, Truck } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { CategoryIcon, priorityBadgeClass, priorityLabel } from '@/components/client/ticketBadges'
import { formatDateTime } from '@/lib/utils'

export interface RegionalSignoffRow {
  id: string; storeName: string; branchCode: string | null; category: string | null; title: string
  priority: string; status: string; jobRef: string | null; supplier: string | null
  submittedAt: string; photoCount: number; certCount: number
}

type Phase = 'review' | 'evidence'
const phaseOf = (s: RegionalSignoffRow): Phase => s.status === 'evidence_requested' ? 'evidence' : 'review'
const PHASE_META: Record<Phase, { label: string; badge: string }> = {
  review:   { label: 'Awaiting your review', badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  evidence: { label: 'Evidence requested',   badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
}
const prioTicket = (p: string) => ({ priority: p } as unknown as Parameters<typeof priorityBadgeClass>[0])

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

const ROW = 'grid gap-4 lg:grid-cols-[1.6fr_1fr_1.1fr_auto] lg:items-center'
const PER_PAGE = 10

export function RegionalSignoff({ signoffs }: { signoffs: RegionalSignoffRow[] }) {
  const [q, setQ] = useState('')
  const [store, setStore] = useState('all')
  const [statusF, setStatusF] = useState<'all' | Phase>('all')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [page, setPage] = useState(1)
  const [helpOpen, setHelpOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const storeNames = useMemo(() => [...new Set(signoffs.map(s => s.storeName))].sort((a, b) => a.localeCompare(b)), [signoffs])
  const stats = useMemo(() => {
    const c = { review: 0, evidence: 0 }
    for (const s of signoffs) c[phaseOf(s)]++
    return { ...c, total: signoffs.length }
  }, [signoffs])

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return signoffs.filter(s => {
      if (store !== 'all' && s.storeName !== store) return false
      if (statusF !== 'all' && phaseOf(s) !== statusF) return false
      if (terms.length) { const hay = `${s.category ?? ''} ${s.title} ${s.storeName} ${s.jobRef ?? ''} ${s.supplier ?? ''}`.toLowerCase(); if (!terms.every(w => hay.includes(w))) return false }
      return true
    }).sort((a, b) => sort === 'newest' ? +new Date(b.submittedAt) - +new Date(a.submittedAt) : +new Date(a.submittedAt) - +new Date(b.submittedAt))
  }, [signoffs, q, store, statusF, sort])

  const groups = useMemo(() => {
    const m = new Map<string, { branchCode: string | null; rows: RegionalSignoffRow[] }>()
    for (const s of shown) { const g = m.get(s.storeName) ?? { branchCode: s.branchCode, rows: [] }; g.rows.push(s); m.set(s.storeName, g) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [shown])

  const totalPages = Math.max(1, Math.ceil(groups.length / PER_PAGE))
  const cur = Math.min(page, totalPages)
  const pageGroups = groups.slice((cur - 1) * PER_PAGE, cur * PER_PAGE)
  const firstShown = groups.length ? (cur - 1) * PER_PAGE + 1 : 0
  const lastShown = Math.min(cur * PER_PAGE, groups.length)

  const toggle = (s: string) => setCollapsed(c => { const n = new Set(c); n.has(s) ? n.delete(s) : n.add(s); return n })
  const clear = () => { setQ(''); setStore('all'); setStatusF('all'); setSort('newest'); setPage(1) }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]"><ClipboardCheck className="text-emerald-600 dark:text-emerald-400" size={22} /> Sign-off</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">Completions awaiting your review, grouped by store. Approve, request more evidence, or raise a snag.</p>
        </div>
        <button type="button" onClick={() => setHelpOpen(o => !o)} className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-blue-600 transition hover:underline dark:text-blue-400"><HelpCircle size={15} /> How sign-off works</button>
      </div>

      {helpOpen && (
        <Card className="p-4 text-sm text-[var(--text-muted)]">
          <p>The supplier submits the COC &amp; proof-of-completion photos. You <span className="font-semibold text-emerald-600 dark:text-emerald-400">approve</span>, <span className="font-semibold text-amber-600 dark:text-amber-400">request more evidence</span>, or <span className="font-semibold text-red-600 dark:text-red-400">raise a snag</span> from the ticket.</p>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={<span className="grid h-11 w-11 place-items-center rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400"><Clock size={20} /></span>} tone="border-blue-500" value={stats.review} title="Awaiting review" sub="Action required" active={statusF === 'review'} onClick={() => { setStatusF(f => f === 'review' ? 'all' : 'review'); setPage(1) }} />
        <StatCard icon={<span className="grid h-11 w-11 place-items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"><CheckCircle2 size={20} /></span>} tone="border-amber-500" value={stats.evidence} title="Evidence pending" sub="Awaiting the supplier" active={statusF === 'evidence'} onClick={() => { setStatusF(f => f === 'evidence' ? 'all' : 'evidence'); setPage(1) }} />
        <StatCard icon={<span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)]"><ClipboardCheck size={20} /></span>} tone="border-[var(--border)]" value={stats.total} title="In sign-off" sub="Total open" active={statusF === 'all'} onClick={() => { setStatusF('all'); setPage(1) }} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="Search by store, supplier, ticket ID or category…" className="w-full rounded-xl bg-[var(--input-bg)] py-2.5 pl-9 pr-3 text-sm text-[var(--text)] ring-1 ring-[var(--border)] outline-none placeholder-[var(--text-faint)] focus:ring-[#C6A35D]/40" />
        </div>
        <Select label="Store" value={store} onChange={v => { setStore(v); setPage(1) }} options={[{ value: 'all', label: 'All stores' }, ...storeNames.map(s => ({ value: s, label: s }))]} />
        <Select label="Status" value={statusF} onChange={v => { setStatusF(v); setPage(1) }} options={[{ value: 'all', label: 'All statuses' }, { value: 'review', label: 'Awaiting review' }, { value: 'evidence', label: 'Evidence pending' }]} />
        <Select label="Sort by" value={sort} onChange={setSort} options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }]} />
        <button type="button" onClick={clear} className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]"><X size={15} /> Clear filters</button>
      </div>

      {!groups.length && (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
          <ClipboardCheck size={28} className="mx-auto mb-2 text-[var(--text-faint)]" />
          <p className="text-sm text-[var(--text-faint)]">{signoffs.length ? 'No submissions match your filters.' : 'Nothing awaiting your sign-off.'}</p>
        </div>
      )}

      {/* Store groups */}
      {pageGroups.map(([storeName, g]) => {
        const open = !collapsed.has(storeName)
        return (
          <div key={storeName} className="overflow-hidden rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)]">
            <div role="button" tabIndex={0} aria-expanded={open} onClick={() => toggle(storeName)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(storeName) } }} className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-[var(--hover)]">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--surface-2)] text-[var(--text-muted)]"><Store size={17} /></span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-base font-bold text-[var(--text)]">{storeName}</span>
                {g.branchCode && <span className="shrink-0 text-sm text-[var(--text-muted)]">· {g.branchCode}</span>}
              </span>
              <span className="shrink-0 text-sm text-[var(--text-muted)]">{g.rows.length} job{g.rows.length === 1 ? '' : 's'}</span>
              <ChevronDown size={18} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>
            {open && (
              <div className="border-t border-[var(--border)]">
                {g.rows.map(s => {
                  const p = phaseOf(s)
                  const meta = PHASE_META[p]
                  return (
                    <div key={s.id} className="block border-b border-[var(--border)] px-4 py-4 last:border-b-0">
                      <div className={ROW}>
                        <div className="flex min-w-0 items-start gap-3">
                          <CategoryIcon category={s.category ?? s.title} priority={s.priority} className="h-11 w-11" iconSize={18} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-[var(--text)]">{s.category || s.title}</p>
                            {s.jobRef && <p className="truncate text-[11px] text-[var(--text-faint)]">Ticket {s.jobRef}</p>}
                            {s.supplier && <p className="flex items-center gap-1 truncate text-[11px] text-[var(--text-muted)]"><Truck size={11} className="shrink-0" /> {s.supplier}</p>}
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${priorityBadgeClass(prioTicket(String(s.priority)))}`}>{priorityLabel(prioTicket(String(s.priority)))}</span>
                              <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${meta.badge}`}>{meta.label}</span>
                            </div>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Submitted</p>
                          <p className="flex items-center gap-1.5 text-sm text-[var(--text)]"><Calendar size={13} className="shrink-0 text-[var(--text-faint)]" /> {formatDateTime(s.submittedAt)}</p>
                          <p className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]"><ImageIcon size={13} className="shrink-0 text-[var(--text-faint)]" /> {s.photoCount} photo{s.photoCount === 1 ? '' : 's'}</p>
                          <p className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]"><FileText size={13} className="shrink-0 text-[var(--text-faint)]" /> {s.certCount} certificate{s.certCount === 1 ? '' : 's'}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Next step</p>
                          <p className="text-sm text-[var(--text)]">{p === 'evidence' ? 'Awaiting the supplier to add the requested evidence.' : 'Review the COC & POC and approve, request evidence, or snag.'}</p>
                        </div>
                        <div className="flex flex-col items-stretch justify-center gap-2 lg:w-40">
                          <Link href={`/regional/tickets/${s.id}`} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500">Review &amp; sign off <ChevronRight size={15} /></Link>
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
