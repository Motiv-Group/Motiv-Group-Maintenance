'use client'

import { useMemo, useState } from 'react'
import { Building2, UsersRound, Clock, User, ChevronDown } from 'lucide-react'
import { Card, SearchInput, FilterSelect } from '@/components/exec/ui'
import { CompanyListRow, type CompanyListItem } from './CompanyListRow'
import type { RegionOpt, ProjectOpt } from './AddAccountForm'

type StatusF = 'all' | 'active' | 'inactive'
type PendingF = 'all' | 'yes' | 'no'
type SortF = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'users'

export function AccountsListView({ companies, totalUsers, pendingTotal, individuals, regions, projects }: {
  companies: CompanyListItem[]
  totalUsers: number
  pendingTotal: number
  individuals: { total: number; activeWeek: number }
  regions: RegionOpt[]
  projects: ProjectOpt[]
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusF>('all')
  const [pending, setPending] = useState<PendingF>('all')
  const [sort, setSort] = useState<SortF>('newest')
  const [indOpen, setIndOpen] = useState(true)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = companies.filter(c => {
      if (status === 'active' && !c.active) return false
      if (status === 'inactive' && c.active) return false
      if (pending === 'yes' && c.pending <= 0) return false
      if (pending === 'no' && c.pending > 0) return false
      if (q && !c.name.toLowerCase().includes(q)) return false
      return true
    })
    const total = (c: CompanyListItem) => c.counts.executive + c.counts.regional_manager + c.counts.store_manager
    rows = [...rows].sort((a, b) => {
      if (sort === 'name-asc') return a.name.localeCompare(b.name)
      if (sort === 'name-desc') return b.name.localeCompare(a.name)
      if (sort === 'users') return total(b) - total(a)
      const ta = new Date(a.createdAt).getTime(), tb = new Date(b.createdAt).getTime()
      return sort === 'oldest' ? ta - tb : tb - ta
    })
    return rows
  }, [companies, search, status, pending, sort])

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5"><Building2 size={15} className="text-[var(--text-faint)]" /> {companies.length} companies</span>
        <span className="inline-flex items-center gap-1.5"><UsersRound size={15} className="text-[var(--text-faint)]" /> {totalUsers} users</span>
        <span className="inline-flex items-center gap-1.5"><Clock size={15} className="text-[var(--text-faint)]" /> {pendingTotal} pending invitation{pendingTotal === 1 ? '' : 's'}</span>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search companies…" className="w-full sm:w-auto sm:min-w-[220px] sm:flex-1" />
        <FilterSelect label="Status" value={status} onChange={setStatus}
          options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        <FilterSelect label="Has pending invites" value={pending} onChange={setPending}
          options={[{ value: 'all', label: 'All' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
        <FilterSelect label="Sort by" value={sort} onChange={setSort}
          options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'name-asc', label: 'Name (A–Z)' }, { value: 'name-desc', label: 'Name (Z–A)' }, { value: 'users', label: 'Most users' }]} />
      </div>

      {/* Independent users (self-signups) */}
      <Card className="p-0 overflow-hidden">
        <button type="button" onClick={() => setIndOpen(o => !o)} aria-expanded={indOpen}
          className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-[var(--hover)]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400"><User size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 font-semibold text-[var(--text)]">
              Independent users <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">{individuals.total}</span>
            </p>
            <p className="text-xs text-[var(--text-muted)]">Public self-signups not linked to a company.</p>
          </div>
          <ChevronDown size={18} className={`shrink-0 text-[var(--text-faint)] transition-transform ${indOpen ? 'rotate-180' : ''}`} />
        </button>
        {indOpen && (
          <div className="border-t border-[var(--border)] p-4">
            <div className="flex items-center gap-3 rounded-xl bg-[var(--surface-2)] p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-500/15 text-slate-600 dark:text-slate-300"><User size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[var(--text)]">Public self-signups</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Standalone jobs, no company ·{' '}
                  {/* Stub: no individuals detail page exists yet. */}
                  <span className="cursor-not-allowed text-blue-600/70 dark:text-blue-400/70" title="Individuals list — coming soon">View users ({individuals.total}) →</span>
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xl font-bold leading-none text-[var(--text)]">{individuals.total}</p>
                <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">{individuals.activeWeek} active this week</p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Companies */}
      <div className="flex items-center gap-1.5 pt-1">
        <Building2 size={16} className="text-blue-600 dark:text-blue-400" />
        <span className="font-semibold text-[var(--text)]">Companies</span>
        <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">{filtered.length}</span>
      </div>

      <div className="space-y-2.5">
        {filtered.map(item => <CompanyListRow key={item.id} item={item} regions={regions} projects={projects} />)}
        {!filtered.length && (
          <Card className="p-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">{companies.length ? 'No companies match these filters.' : 'No companies yet. Create one to start inviting accounts.'}</p>
          </Card>
        )}
      </div>
    </div>
  )
}
