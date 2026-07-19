'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { LayoutGrid, List, Table2, Search, ArrowRight, CalendarClock, CheckCircle2, AlertTriangle, MapPin } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { formatDate } from '@/lib/utils'
import { AnimatedBar } from '@/components/projects/AnimatedBar'
import { SegmentedProgressBar } from '@/components/projects/SegmentedProgressBar'
import { ViewToggle } from '@/components/projects/ViewToggle'
import { STORE_STATUS_LABEL, STORE_STATUS_PILL, OVERDUE_PILL } from '@/components/projects/statusStyles'
import { milestoneSteps, milestoneCounts, stageLabel, MILESTONE_LABELS } from '@/lib/projects/progress'
import type { ProjectRow, ProjectSummary, StoreRow } from '@/lib/projects/data'

type StatusFilter = 'all' | 'not_started' | 'in_progress' | 'complete' | 'overdue'

export function RegionalProjectDashboard({ project, summary, stores }: { project: ProjectRow; summary: ProjectSummary; stores: StoreRow[] }) {
  const [view, setView] = useState<'cards' | 'table'>('table')
  // Phones get their own compact grid/list switch (the cards/table one above is sm+).
  const [mobileView, setMobileView] = useState<'grid' | 'list'>('grid')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<'branch' | 'name' | 'progress' | 'start' | 'end'>('start')

  const counts = useMemo(() => milestoneCounts(stores), [stores])
  const daysLeft = daysUntil(project.end_date)
  const endingSoon = useMemo(() => stores.filter((s) => withinDays(s.end_date, 7) && s.progress < 100).length, [stores])
  const startingSoon = useMemo(() => stores.filter((s) => withinDays(s.start_date, 7)).length, [stores])
  const recentlyDone = useMemo(() => stores.filter((s) => s.progress >= 100 && recentlyUpdated(s.updated_at, 7)).length, [stores])

  const filtered = useMemo(() => {
    let rows = stores
    const term = q.trim().toLowerCase()
    if (term) rows = rows.filter((r) => [r.store_name, r.branch_code, r.town].some((v) => v?.toLowerCase().includes(term)))
    if (status === 'not_started') rows = rows.filter((r) => r.progress === 0)
    else if (status === 'in_progress') rows = rows.filter((r) => r.progress > 0 && r.progress < 100)
    else if (status === 'complete') rows = rows.filter((r) => r.progress >= 100)
    else if (status === 'overdue') rows = rows.filter((r) => r.overdue)
    const sorted = [...rows]
    sorted.sort((a, b) => {
      if (sort === 'progress') return b.progress - a.progress
      if (sort === 'name') return (a.store_name ?? '').localeCompare(b.store_name ?? '')
      if (sort === 'start') return (a.start_date ?? '').localeCompare(b.start_date ?? '')
      if (sort === 'end') return (a.end_date ?? '').localeCompare(b.end_date ?? '')
      return a.branch_code.localeCompare(b.branch_code)
    })
    return sorted
  }, [stores, q, status, sort])

  return (
    <div className="space-y-5">
      <Link href="/regional/projects" className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">← All projects</Link>

      {/* Hero */}
      <Card className="overflow-hidden">
        <div className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-slate-900 p-4 text-white sm:p-6">
          {summary.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={summary.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
          )}
          <div className="relative">
            <p className="text-xs font-medium text-white/70">{project.client_name ?? 'Project'}</p>
            <h1 className="text-xl font-bold sm:text-2xl">{project.name}</h1>
            {project.description && <p className="mt-1 text-sm text-white/80 max-w-2xl">{project.description}</p>}
          </div>
        </div>
        <div className="p-4 space-y-4 sm:p-5">
          <AnimatedBar pct={summary.progress} stage={stageLabel(summary.progress)} />
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 max-sm:[&>*:nth-child(5)]:col-span-2">
            <Stat label="Total stores" value={summary.storeCount} />
            <Stat label="Completed" value={summary.completed} tone="good" />
            <Stat label="In progress" value={summary.inProgress} tone="info" />
            <Stat label="Not started" value={summary.notStarted} />
            <Stat label="Overdue" value={summary.overdue} tone={summary.overdue ? 'bad' : 'default'} />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-muted)]">
            <span>Start: <b className="text-[var(--text)]">{formatDate(project.start_date) || '—'}</b></span>
            <span>End: <b className="text-[var(--text)]">{formatDate(project.end_date) || '—'}</b></span>
            {daysLeft != null && <span className={daysLeft < 0 ? 'text-red-500 font-semibold' : ''}>{daysLeft >= 0 ? `${daysLeft} days remaining` : `${-daysLeft} days overdue`}</span>}
            <span className="text-[var(--text-faint)]">Updated {formatDate(summary.updated_at)}</span>
          </div>
        </div>
      </Card>

      {/* Milestone funnel + this-week */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <h2 className="text-sm font-bold text-[var(--text)] mb-3">Milestone progress</h2>
          <div className="space-y-2.5">
            {(['on_site', 'before_photos', 'after_photos', 'signoff'] as const).map((m) => {
              const n = counts[m]
              const pct = summary.storeCount ? Math.round((n / summary.storeCount) * 100) : 0
              return (
                <div key={m} className="flex items-center gap-3 text-xs">
                  <span className="w-24 shrink-0 text-[var(--text-muted)]">{MILESTONE_LABELS[m]}</span>
                  <span className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden"><span className="block h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} /></span>
                  <span className="w-16 text-right tabular-nums text-[var(--text)]">{n}/{summary.storeCount}</span>
                </div>
              )
            })}
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3 content-start">
          <Summary icon={<MapPin size={15} />} label="Starting this week" value={startingSoon} />
          <Summary icon={<CalendarClock size={15} />} label="Ending this week" value={endingSoon} tone={endingSoon ? 'warn' : 'default'} />
          <Summary icon={<AlertTriangle size={15} />} label="Overdue" value={summary.overdue} tone={summary.overdue ? 'bad' : 'default'} />
          <Summary icon={<CheckCircle2 size={15} />} label="Recently completed" value={recentlyDone} tone="good" />
        </div>
      </div>

      {/* Store section */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input className="w-full rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] pl-8 pr-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500/50" placeholder="Search store, branch, town…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {/* Mobile: controls form one swipeable strip under the search (natural widths —
            flex-1 would shrink a native select below its label and clip the text);
            sm:contents restores the flex-wrap desktop layout. */}
        <div className="flex w-full flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar sm:contents">
        <select className="shrink-0 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] px-3 py-2 text-sm text-[var(--text)] sm:flex-none" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="all">All statuses</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="complete">Complete</option>
          <option value="overdue">Overdue</option>
        </select>
        <select className="shrink-0 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] px-3 py-2 text-sm text-[var(--text)] sm:flex-none" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="branch">Sort: Branch</option>
          <option value="name">Sort: Name</option>
          <option value="progress">Sort: Completion</option>
          <option value="start">Sort: Start date</option>
          <option value="end">Sort: End date</option>
        </select>
        {/* Mobile-only grid/list switch (the sm+ cards/table toggle can't fit the phone). */}
        <ViewToggle
          className="sm:hidden"
          value={mobileView}
          onChange={setMobileView}
          options={[{ value: 'grid', icon: LayoutGrid, label: 'Tile view' }, { value: 'list', icon: List, label: 'List view' }]}
        />
        {/* View toggle is sm+ — phones use the mobile switch above (the table needs ~470px). */}
        <div className="hidden rounded-lg ring-1 ring-[var(--border)] overflow-hidden sm:flex">
          <button onClick={() => setView('cards')} className={`p-2 ${view === 'cards' ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)] hover:bg-[var(--hover)]'}`}><LayoutGrid size={15} /></button>
          <button onClick={() => setView('table')} className={`p-2 ${view === 'table' ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)] hover:bg-[var(--hover)]'}`}><Table2 size={15} /></button>
        </div>
        </div>
      </div>

      {(() => {
        // Shared card grid — the cards view (sm+). The table needs ~470px even with
        // hidden columns, so phones use the compact grid/list below instead.
        const cardsView = (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <Link key={s.id} href={`/regional/projects/${project.id}/stores/${s.id}`}>
                <Card className="p-4 h-full transition hover:ring-blue-500/40 hover:-translate-y-0.5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[var(--text)] truncate">{s.store_name ?? s.branch_code}</h3>
                      <p className="text-[11px] text-[var(--text-muted)] truncate">{s.branch_code}{s.town && ` · ${s.town}`}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.overdue ? OVERDUE_PILL : STORE_STATUS_PILL[s.status]}`}>{s.overdue ? 'Overdue' : STORE_STATUS_LABEL[s.status]}</span>
                  </div>
                  <div className="flex items-baseline justify-between"><span className="text-[11px] text-[var(--text-muted)]">{stageLabel(s.progress)}</span><span className="text-lg font-bold tabular-nums text-[var(--text)]">{s.progress}%</span></div>
                  <SegmentedProgressBar steps={milestoneSteps(s)} />
                </Card>
              </Link>
            ))}
          </div>
        )
        // Phone-only compact tile grid — 2-up, fits 375px with no sideways scroll.
        const mobileGrid = (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((s) => (
              <Link key={s.id} href={`/regional/projects/${project.id}/stores/${s.id}`}>
                {/* flex-col + grow name: the status row and progress bar pin to the
                    tile bottom, so they line up across tiles whose names wrap differently. */}
                <Card className="flex h-full flex-col gap-2 p-3">
                  <div className="min-w-0 grow">
                    {/* Primary name never ellipsizes on mobile — wrap to two lines instead. */}
                    <h3 className="line-clamp-2 break-words text-sm font-bold text-[var(--text)]">{s.store_name ?? s.branch_code}</h3>
                    <p className="truncate text-[10px] text-[var(--text-muted)]">{s.branch_code}</p>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <span className={`truncate text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${s.overdue ? OVERDUE_PILL : STORE_STATUS_PILL[s.status]}`}>{s.overdue ? 'Overdue' : STORE_STATUS_LABEL[s.status]}</span>
                    <span className="shrink-0 text-base font-bold tabular-nums text-[var(--text)]">{s.progress}%</span>
                  </div>
                  <SegmentedProgressBar steps={milestoneSteps(s)} showLabels={false} height="h-1.5" />
                </Card>
              </Link>
            ))}
          </div>
        )
        // Phone-only compact list — one row per store, no horizontal scroll.
        const mobileList = (
          <Card className="divide-y divide-[var(--border)]">
            {filtered.map((s) => (
              <Link key={s.id} href={`/regional/projects/${project.id}/stores/${s.id}`} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words text-sm font-medium text-[var(--text)]">{s.store_name ?? s.branch_code}</p>
                  <p className="truncate text-[11px] text-[var(--text-muted)]">{s.branch_code}{s.town && ` · ${s.town}`}</p>
                </div>
                {/* Fixed-width % and pill columns so every row lines up. */}
                <span className="w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">{s.progress}%</span>
                <span className={`inline-flex w-[108px] shrink-0 justify-center whitespace-nowrap text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.overdue ? OVERDUE_PILL : STORE_STATUS_PILL[s.status]}`}>{s.overdue ? 'Overdue' : STORE_STATUS_LABEL[s.status]}</span>
              </Link>
            ))}
          </Card>
        )
        if (filtered.length === 0) return (
          <Card className="p-10 text-center text-sm text-[var(--text-muted)]">{stores.length === 0 ? 'No stores in this project yet.' : 'No stores match your filters.'}</Card>
        )
        return (
        <>
        <div className="sm:hidden">{mobileView === 'grid' ? mobileGrid : mobileList}</div>
        {view === 'cards' && <div className="hidden sm:block">{cardsView}</div>}
        <Card className={`hidden overflow-hidden ${view === 'table' ? 'sm:block' : ''}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] border-b border-[var(--border)]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Store</th>
                  <th className="text-left px-3 py-2 font-semibold">Branch</th>
                  <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">Town</th>
                  <th className="text-left px-3 py-2 font-semibold hidden lg:table-cell">Start</th>
                  <th className="text-left px-3 py-2 font-semibold hidden lg:table-cell">End</th>
                  <th className="text-left px-3 py-2 font-semibold w-40">Completion</th>
                  <th className="text-left px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)]">
                    <td className="px-3 py-2"><Link href={`/regional/projects/${project.id}/stores/${s.id}`} className="text-[var(--text)] hover:text-blue-500">{s.store_name ?? '—'}</Link></td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{s.branch_code}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)] hidden md:table-cell">{s.town ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)] hidden lg:table-cell">{formatDate(s.start_date) || '—'}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)] hidden lg:table-cell">{formatDate(s.end_date) || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{ width: `${s.progress}%` }} /></div>
                        <span className="text-[11px] tabular-nums text-[var(--text-muted)] w-8 text-right">{s.progress}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.overdue ? OVERDUE_PILL : STORE_STATUS_PILL[s.status]}`}>{s.overdue ? 'Overdue' : STORE_STATUS_LABEL[s.status]}</span></td>
                    <td className="px-3 py-2 text-right"><Link href={`/regional/projects/${project.id}/stores/${s.id}`} className="text-blue-500"><ArrowRight size={15} className="inline" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        </>
        )
      })()}
    </div>
  )
}

function Stat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'good' | 'bad' | 'info' }) {
  const c = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : tone === 'info' ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--text)]'
  return (
    <div className="rounded-xl ring-1 ring-[var(--border)] p-3 text-center">
      <div className={`text-2xl font-bold leading-none ${c}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)] mt-1.5">{label}</div>
    </div>
  )
}

function Summary({ icon, label, value, tone = 'default' }: { icon: React.ReactNode; label: string; value: number; tone?: 'default' | 'good' | 'bad' | 'warn' }) {
  const c = tone === 'good' ? 'text-emerald-500' : tone === 'bad' ? 'text-red-500' : tone === 'warn' ? 'text-amber-500' : 'text-blue-500'
  return (
    <Card className="p-3">
      <div className={`flex items-center gap-1.5 text-[11px] font-medium ${c}`}>{icon}<span className="text-[var(--text-muted)]">{label}</span></div>
      <div className="text-xl font-bold text-[var(--text)] mt-1">{value}</div>
    </Card>
  )
}

function daysUntil(date: string | null): number | null {
  if (!date) return null
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}
function withinDays(date: string | null, days: number): boolean {
  const d = daysUntil(date)
  return d != null && d >= 0 && d <= days
}
function recentlyUpdated(iso: string, days: number): boolean {
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && Date.now() - t <= days * 86400000
}
