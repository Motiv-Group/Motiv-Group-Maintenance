'use client'

// Supplier Sign-off tab — stat cards (Awaiting review · Approved · Changes
// requested · Total), a filter bar (search · store · status · sort · clear), and
// store-grouped submission cards showing what was submitted, the manager's
// decision and the supplier's next step. Paginated by store.
import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ClipboardCheck, Clock, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, ChevronLeft, Search, Store, X, Image as ImageIcon, FileText, ArrowRight, HelpCircle, Calendar } from 'lucide-react'
import type { SupplierSignoffRow } from '@/lib/health/data'
import { Card } from '@/components/exec/ui'
import { CategoryIcon, priorityBadgeClass, priorityLabel } from '@/components/client/ticketBadges'
import { formatDateTime } from '@/lib/utils'

// P1 (urgent) → P4 (low). A store's icon takes the colour of its most urgent job.
const PRANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 }
const topPriority = (rows: SupplierSignoffRow[]): string => [...rows].map(r => r.priority).sort((a, b) => (PRANK[a] ?? 9) - (PRANK[b] ?? 9))[0] ?? 'P3'
const prioTicket = (p: string) => ({ priority: p } as unknown as Parameters<typeof priorityBadgeClass>[0])

type Phase = 'awaiting' | 'approved' | 'changes'
const phaseOf = (status: string): Phase => status === 'accepted' ? 'approved' : status === 'rejected' ? 'changes' : 'awaiting'
const PHASE_META: Record<Phase, { label: string; badge: string }> = {
  awaiting: { label: 'Awaiting review', badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  approved: { label: 'Approved', badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  changes: { label: 'Changes requested', badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
}
function nextStep(p: Phase, ticketStatus: string): { Icon: typeof Clock; cls: string; title: string; desc: string } {
  const green = 'text-emerald-600 ring-emerald-500/30 dark:text-emerald-400'
  if (p === 'changes') return { Icon: AlertCircle, cls: 'text-red-600 ring-red-500/30 dark:text-red-400', title: 'View feedback', desc: 'Update your submission and resubmit' }
  if (p === 'approved') {
    if (ticketStatus === 'completed') return { Icon: CheckCircle2, cls: green, title: 'Job complete', desc: 'Signed off and closed — no further action' }
    if (['approved_closeout', 'vo_declined'].includes(ticketStatus)) return { Icon: ArrowRight, cls: green, title: 'Confirm additional work', desc: 'Raise a variation order for extra work, or confirm there are none' }
    return { Icon: CheckCircle2, cls: green, title: 'Approved', desc: 'No further action needed' }
  }
  return { Icon: Clock, cls: 'text-[var(--text-muted)] ring-[var(--border)]', title: 'No action needed', desc: 'Waiting for the client to review' }
}

function StatCard({ icon, tone, value, title, sub, active, onClick }: { icon: ReactNode; tone: string; value: number; title: string; sub: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`flex items-center gap-3 rounded-xl bg-[var(--surface)] p-4 text-left ring-1 transition hover:bg-[var(--hover)] ${active ? 'ring-2 ring-blue-500/50' : 'ring-[var(--border)]'}`}>
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
    <label className="relative flex min-h-[44px] w-full items-center gap-1.5 rounded-xl bg-[var(--input-bg)] px-3 py-2.5 text-sm ring-1 ring-[var(--border)] transition focus-within:ring-blue-500/40 sm:min-h-0 sm:w-auto sm:min-w-[150px] sm:flex-none">
      <span className="whitespace-nowrap text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value as T)} className="w-full cursor-pointer appearance-none bg-transparent pr-4 font-semibold text-[var(--text)] outline-none">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-[var(--text-faint)]" />
    </label>
  )
}

const ROW = 'grid gap-4 lg:grid-cols-[1.6fr_1fr_1fr_1.4fr_auto] lg:items-center'
const PER_PAGE = 10

export function SupplierSignoff({ signoffs }: { signoffs: SupplierSignoffRow[] }) {
  const [q, setQ] = useState('')
  const [store, setStore] = useState('all')
  const [statusF, setStatusF] = useState<'all' | Phase>('all')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [page, setPage] = useState(1)
  const [helpOpen, setHelpOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const storeNames = useMemo(() => [...new Set(signoffs.map(s => s.storeName))].sort((a, b) => a.localeCompare(b)), [signoffs])
  const stats = useMemo(() => {
    const c = { awaiting: 0, approved: 0, changes: 0 }
    for (const s of signoffs) c[phaseOf(s.status)]++
    return { ...c, total: signoffs.length }
  }, [signoffs])

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return signoffs.filter(s => {
      if (store !== 'all' && s.storeName !== store) return false
      if (statusF !== 'all' && phaseOf(s.status) !== statusF) return false
      if (terms.length) { const hay = `${s.category ?? ''} ${s.ticketTitle} ${s.storeName} ${s.jobRef ?? ''}`.toLowerCase(); if (!terms.every(w => hay.includes(w))) return false }
      return true
    }).sort((a, b) => sort === 'newest' ? +new Date(b.createdAt) - +new Date(a.createdAt) : +new Date(a.createdAt) - +new Date(b.createdAt))
  }, [signoffs, q, store, statusF, sort])

  const groups = useMemo(() => {
    const m = new Map<string, { branchCode: string | null; rows: SupplierSignoffRow[] }>()
    for (const s of shown) { const g = m.get(s.storeName) ?? { branchCode: s.branchCode, rows: [] }; g.rows.push(s); m.set(s.storeName, g) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [shown])

  const totalPages = Math.max(1, Math.ceil(groups.length / PER_PAGE))
  const cur = Math.min(page, totalPages)
  const pageGroups = groups.slice((cur - 1) * PER_PAGE, cur * PER_PAGE)
  const firstShown = groups.length ? (cur - 1) * PER_PAGE + 1 : 0
  const lastShown = Math.min(cur * PER_PAGE, groups.length)

  const toggleStore = (s: string) => setCollapsed(c => { const n = new Set(c); n.has(s) ? n.delete(s) : n.add(s); return n })
  const clear = () => { setQ(''); setStore('all'); setStatusF('all'); setSort('newest'); setPage(1) }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]"><ClipboardCheck className="text-emerald-600 dark:text-emerald-400" size={22} /> Sign-off</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">Track completion submissions and manager decisions.</p>
        </div>
        <button type="button" onClick={() => setHelpOpen(o => !o)} className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-blue-600 transition hover:underline dark:text-blue-400"><HelpCircle size={15} /> How sign-off works</button>
      </div>

      {helpOpen && (
        <Card className="p-4 text-sm text-[var(--text-muted)]">
          <p>You submit the COC &amp; proof-of-completion photos; the client reviews and either <span className="font-semibold text-emerald-600 dark:text-emerald-400">approves</span> (you can then raise any extra work), <span className="font-semibold text-amber-600 dark:text-amber-400">requests changes</span> (update and resubmit), or leaves it <span className="font-semibold text-blue-600 dark:text-blue-400">awaiting review</span>. You can&apos;t mark jobs complete yourself.</p>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<span className="grid h-11 w-11 place-items-center rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400"><Clock size={20} /></span>} tone="border-blue-500" value={stats.awaiting} title="Awaiting review" sub="Waiting for manager review" active={statusF === 'awaiting'} onClick={() => { setStatusF(f => f === 'awaiting' ? 'all' : 'awaiting'); setPage(1) }} />
        <StatCard icon={<span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={20} /></span>} tone="border-emerald-500" value={stats.approved} title="Approved" sub="Ready for next step" active={statusF === 'approved'} onClick={() => { setStatusF(f => f === 'approved' ? 'all' : 'approved'); setPage(1) }} />
        <StatCard icon={<span className="grid h-11 w-11 place-items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"><AlertCircle size={20} /></span>} tone="border-amber-500" value={stats.changes} title="Changes requested" sub="Action required" active={statusF === 'changes'} onClick={() => { setStatusF(f => f === 'changes' ? 'all' : 'changes'); setPage(1) }} />
        <StatCard icon={<span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)]"><ClipboardCheck size={20} /></span>} tone="border-[var(--border)]" value={stats.total} title="Total sign-offs" sub="All time" active={false} onClick={() => { setStatusF('all'); setPage(1) }} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="Search jobs by store, ticket ID or category…" className="w-full rounded-xl bg-[var(--input-bg)] py-2.5 pl-9 pr-3 text-sm text-[var(--text)] ring-1 ring-[var(--border)] outline-none placeholder-[var(--text-faint)] focus:ring-blue-500/40" />
        </div>
        <Select label="Store" value={store} onChange={v => { setStore(v); setPage(1) }} options={[{ value: 'all', label: 'All stores' }, ...storeNames.map(s => ({ value: s, label: s }))]} />
        <Select label="Status" value={statusF} onChange={v => { setStatusF(v); setPage(1) }} options={[{ value: 'all', label: 'All status' }, { value: 'awaiting', label: 'Awaiting review' }, { value: 'approved', label: 'Approved' }, { value: 'changes', label: 'Changes requested' }]} />
        <Select label="Sort by" value={sort} onChange={setSort} options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }]} />
        <button type="button" onClick={clear} className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]"><X size={15} /> Clear filters</button>
      </div>

      {!groups.length && (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center sm:p-12">
          <ClipboardCheck size={28} className="mx-auto mb-2 text-[var(--text-faint)]" />
          <p className="text-sm text-[var(--text-faint)]">{signoffs.length ? 'No sign-offs match your filters.' : 'No sign-offs yet.'}</p>
        </div>
      )}

      {/* Store groups */}
      {pageGroups.map(([storeName, g]) => {
        const open = !collapsed.has(storeName)
        const hasChanges = g.rows.some(s => phaseOf(s.status) === 'changes')
        return (
          <div key={storeName} className={`overflow-hidden rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)]`}>
            <div role="button" tabIndex={0} aria-expanded={open} onClick={() => toggleStore(storeName)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleStore(storeName) } }} className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-[var(--hover)]">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${priorityBadgeClass(prioTicket(topPriority(g.rows)))}`}><Store size={17} /></span>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="line-clamp-2 break-words text-base font-bold text-[var(--text)] sm:line-clamp-1">{storeName}</span>
              {g.branchCode && <span className="shrink-0 text-sm text-[var(--text-muted)]">· {g.branchCode}</span>}
            </span>
            <span className="shrink-0 text-sm text-[var(--text-muted)]">{g.rows.length} job{g.rows.length === 1 ? '' : 's'}</span>
            <ChevronDown size={18} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>
            {open && (
              <div className="border-t border-[var(--border)]">
                {g.rows.map(s => {
                  const phase = phaseOf(s.status)
                  const meta = PHASE_META[phase]
                  const ns = nextStep(phase, s.ticketStatus)
                  return (
                    <Link key={s.id} href={`/supplier/tickets/${s.ticketId}`} className="block border-b border-[var(--border)] px-4 py-4 transition last:border-b-0 hover:bg-[var(--hover)]">
                      <div className={ROW}>
                        {/* Job */}
                        <div className="flex min-w-0 items-start gap-3">
                          <CategoryIcon category={s.category ?? s.ticketTitle} priority={s.priority} className="h-11 w-11" iconSize={18} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-[var(--text)]">{s.category || s.ticketTitle}</p>
                            {s.jobRef && <p className="truncate text-[11px] text-[var(--text-faint)]">Ticket {s.jobRef}</p>}
                            {s.description && <p className="mt-0.5 truncate text-sm text-[var(--text-muted)]">{s.description}</p>}
                          </div>
                        </div>
                        {/* Submitted */}
                        <div className="min-w-0">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Submitted</p>
                          <p className="flex items-center gap-1.5 text-sm text-[var(--text)]"><Calendar size={13} className="shrink-0 text-[var(--text-faint)]" /> {formatDateTime(s.createdAt)}</p>
                          <p className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]"><ImageIcon size={13} className="shrink-0 text-[var(--text-faint)]" /> {s.photoCount} photo{s.photoCount === 1 ? '' : 's'}</p>
                          <p className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]"><FileText size={13} className="shrink-0 text-[var(--text-faint)]" /> {s.certCount} certificate{s.certCount === 1 ? '' : 's'}</p>
                        </div>
                        {/* Decision */}
                        <div className="min-w-0">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Decision</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${priorityBadgeClass(prioTicket(s.priority))}`}>{priorityLabel(prioTicket(s.priority))}</span>
                            <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${meta.badge}`}>{meta.label}</span>
                          </div>
                          {s.decidedBy && <p className="mt-1 text-[11px] text-[var(--text-muted)]">by {s.decidedBy}</p>}
                          {s.decidedAt && <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(s.decidedAt)}</p>}
                        </div>
                        {/* Next step */}
                        <div className="min-w-0">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Next step</p>
                          <div className={`rounded-lg px-3 py-2 ring-1 ${ns.cls}`}>
                            <p className={`flex items-center gap-1.5 text-sm font-semibold ${ns.cls.split(' ')[0]}`}><ns.Icon size={14} className="shrink-0" /> {ns.title}</p>
                            <p className="text-[11px] text-[var(--text-muted)]">{ns.desc}</p>
                          </div>
                        </div>
                        <ChevronRight size={18} className="hidden justify-self-end text-[var(--text-faint)] lg:block" />
                      </div>
                    </Link>
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
              <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={cur <= 1} aria-label="Previous page" className="rounded-lg p-2.5 text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-40 sm:p-1.5"><ChevronLeft size={15} /></button>
              <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-blue-600 px-2 text-sm font-semibold text-white">{cur}</span>
              <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={cur >= totalPages} aria-label="Next page" className="rounded-lg p-2.5 text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-40 sm:p-1.5"><ChevronRight size={15} /></button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
