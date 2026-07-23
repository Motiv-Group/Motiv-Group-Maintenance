'use client'

import { useMemo, useState } from 'react'
import {
  UsersRound, Crown, Building2, Store, Truck, UserPlus, Plus, ChevronDown, ChevronLeft, ChevronRight,
  MoreHorizontal, Upload, Check, ShieldCheck, FolderOpen, X,
} from 'lucide-react'
import { Card, SearchInput, FilterSelect } from '@/components/exec/ui'
import { formatDate } from '@/lib/utils'
import { CompanyAvatar } from './CompanyAvatar'
import { CompanyInviteModal } from './CompanyInviteModal'
import { CompanyBulkImportModal } from './CompanyBulkImportModal'
import { SupplierInviteModal } from './SupplierInviteModal'
import { SupplierBulkImportModal } from './SupplierBulkImportModal'
import { RmProjectSelect } from './RmProjectSelect'
import type { RegionOpt, ProjectOpt } from './AddAccountForm'

// ── Payload types (built server-side in the page) ──────────────────────────
export type Role = 'executive' | 'regional_manager' | 'store_manager'
/** Project-access summary per user. `na` = concept doesn't apply (store managers). */
export type ProjAccess = { mode: 'full' | 'partial' | 'none' | 'na'; assigned: number; total: number }
export type DetailUser = {
  id: string
  name: string
  email: string
  role: Role
  location: string
  invitedAt: string
  lastActive: string | null
  access: ProjAccess
  /** RM only: assigned project ids (feeds the Project access tab editor). */
  projectIds: string[]
}
export type DetailSupplier = { id: string; name: string; verified: boolean; isMotiv: boolean; pending: boolean }
export type CompanyDetail = { id: string; name: string; logoUrl: string | null; active: boolean; createdAt: string }

const ROLE_META: Record<Role, { label: string; plural: string; Icon: React.ElementType }> = {
  executive: { label: 'Executive', plural: 'Executives', Icon: Crown },
  regional_manager: { label: 'Regional Manager', plural: 'Regional Managers', Icon: Building2 },
  store_manager: { label: 'Store Manager', plural: 'Store Managers', Icon: Store },
}

type Tab = 'people' | 'suppliers' | 'pending' | 'access'
type ModalKind = 'invite' | 'supplier' | 'bulk' | 'supplierBulk'

// ── time helpers ───────────────────────────────────────────────────────────
function daysAgo(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000)
}
/** "Today, 09:14" · "Yesterday" · "3 days ago" · date for older. `—` when never. */
function relativeActive(iso: string | null): string {
  if (!iso) return '—'
  const d = daysAgo(iso)
  if (d == null) return '—'
  if (d <= 0) return `Today, ${new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`
  if (d === 1) return 'Yesterday'
  if (d < 30) return `${d} days ago`
  return formatDate(iso)
}

// ── small presentational bits ──────────────────────────────────────────────
const TINT: Record<string, string> = {
  blue: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  purple: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  teal: 'bg-teal-500/15 text-teal-600 dark:text-teal-400',
}

function StatTile({ Icon, tint, count, label, active, pending }: {
  Icon: React.ElementType; tint: keyof typeof TINT; count: number; label: string; active: number; pending: number
}) {
  return (
    <Card className="p-4">
      <span className={`grid h-9 w-9 place-items-center rounded-lg ${TINT[tint]}`}><Icon size={18} /></span>
      <p className="mt-3 text-2xl font-bold leading-none text-[var(--text)]">{count}</p>
      <p className="mt-1 text-sm font-medium text-[var(--text-muted)]">{label}</p>
      <p className="mt-1.5 text-[11px] text-[var(--text-faint)]">
        {active} active{pending > 0 && <> · <span className="text-amber-600 dark:text-amber-400">{pending} pending</span></>}
      </p>
    </Card>
  )
}

function StatusCell({ active, invitedAt }: { active: boolean; invitedAt: string }) {
  return (
    <div>
      <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
        <i className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        {active ? 'Active' : 'Pending'}
      </span>
      <p className="mt-0.5 text-xs text-[var(--text-faint)]">Invited {formatDate(invitedAt)}</p>
    </div>
  )
}

function AccessCell({ access, onView }: { access: ProjAccess; onView: () => void }) {
  if (access.mode === 'na') return <span className="text-sm text-[var(--text-faint)]">—</span>
  if (access.mode === 'full') return (
    <div>
      <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]">
        <Check size={15} className="text-emerald-500" /> All projects
      </span>
      <p className="mt-0.5 text-xs text-[var(--text-faint)]">Full access</p>
    </div>
  )
  if (access.mode === 'none') return (
    <div>
      <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
        <FolderOpen size={15} className="text-[var(--text-faint)]" /> No projects
      </span>
      <button type="button" onClick={onView} className="mt-0.5 text-xs text-blue-600 dark:text-blue-400 hover:underline">Assign</button>
    </div>
  )
  return (
    <div>
      <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]">
        <FolderOpen size={15} className="text-[var(--text-faint)]" /> {access.assigned} of {access.total} projects
      </span>
      <button type="button" onClick={onView} className="mt-0.5 block text-xs text-blue-600 dark:text-blue-400 hover:underline">View projects</button>
    </div>
  )
}

function SupplierStatus({ s }: { s: DetailSupplier }) {
  if (s.pending) return <span className="text-sm text-amber-600 dark:text-amber-400">Pending</span>
  if (s.verified) return <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400"><ShieldCheck size={14} /> Verified</span>
  return <span className="text-sm text-[var(--text-muted)]">Active</span>
}

// ── main view ──────────────────────────────────────────────────────────────
export function CompanyDetailView({ company, users, suppliers, regions, projects }: {
  company: CompanyDetail; users: DetailUser[]; suppliers: DetailSupplier[]; regions: RegionOpt[]; projects: ProjectOpt[]
}) {
  const [tab, setTab] = useState<Tab>('people')
  const [modal, setModal] = useState<ModalKind | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // People filters
  const [search, setSearch] = useState('')
  const [roleF, setRoleF] = useState<'all' | Role>('all')
  const [statusF, setStatusF] = useState<'all' | 'active' | 'pending'>('all')
  const [accessF, setAccessF] = useState<'all' | 'full' | 'partial' | 'none'>('all')
  const [sort, setSort] = useState<'name-asc' | 'name-desc' | 'recent' | 'status'>('name-asc')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  const byRole = (r: Role) => users.filter(u => u.role === r)
  const activeCount = (rows: DetailUser[]) => rows.filter(u => u.lastActive).length
  const kpis = [
    { Icon: UsersRound, tint: 'blue' as const, label: 'Total users', count: users.length, active: activeCount(users), pending: users.length - activeCount(users) },
    { Icon: Crown, tint: 'purple' as const, label: 'Executives', count: byRole('executive').length, active: activeCount(byRole('executive')), pending: byRole('executive').length - activeCount(byRole('executive')) },
    { Icon: Building2, tint: 'emerald' as const, label: 'Regional Managers', count: byRole('regional_manager').length, active: activeCount(byRole('regional_manager')), pending: byRole('regional_manager').length - activeCount(byRole('regional_manager')) },
    { Icon: Store, tint: 'amber' as const, label: 'Store Managers', count: byRole('store_manager').length, active: activeCount(byRole('store_manager')), pending: byRole('store_manager').length - activeCount(byRole('store_manager')) },
    { Icon: Truck, tint: 'teal' as const, label: 'Suppliers', count: suppliers.length, active: suppliers.filter(s => !s.pending).length, pending: suppliers.filter(s => s.pending).length },
  ]

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = users.filter(u => {
      if (roleF !== 'all' && u.role !== roleF) return false
      if (statusF === 'active' && !u.lastActive) return false
      if (statusF === 'pending' && u.lastActive) return false
      if (accessF !== 'all' && u.access.mode !== accessF) return false
      if (q && !(`${u.name} ${u.email}`.toLowerCase().includes(q))) return false
      return true
    })
    rows = [...rows].sort((a, b) => {
      if (sort === 'name-asc') return (a.name || a.email).localeCompare(b.name || b.email)
      if (sort === 'name-desc') return (b.name || b.email).localeCompare(a.name || a.email)
      if (sort === 'recent') return (new Date(b.lastActive ?? 0).getTime()) - (new Date(a.lastActive ?? 0).getTime())
      // status: active first, then name
      if (!!a.lastActive !== !!b.lastActive) return a.lastActive ? -1 : 1
      return (a.name || a.email).localeCompare(b.name || b.email)
    })
    return rows
  }, [users, search, roleF, statusF, accessF, sort])

  const total = filtered.length
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  const curPage = Math.min(page, pageCount)
  const start = (curPage - 1) * perPage
  const pageRows = filtered.slice(start, start + perPage)
  const filtersDirty = search !== '' || roleF !== 'all' || statusF !== 'all' || accessF !== 'all'
  const resetFilters = () => { setSearch(''); setRoleF('all'); setStatusF('all'); setAccessF('all'); setPage(1) }

  const pendingUsers = users.filter(u => !u.lastActive)
  const pendingSuppliers = suppliers.filter(s => s.pending)
  const rmUsers = users.filter(u => u.role === 'regional_manager')

  const openModal = (k: ModalKind) => { setModal(k); setMenuOpen(false) }
  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'people', label: 'People' },
    { key: 'suppliers', label: 'Suppliers', badge: suppliers.length || undefined },
    { key: 'pending', label: 'Pending invitations', badge: (pendingUsers.length + pendingSuppliers.length) || undefined },
    { key: 'access', label: 'Project access' },
  ]

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <CompanyAvatar name={company.name} logoUrl={company.logoUrl} size={48} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 text-2xl font-bold text-[var(--text)] break-words line-clamp-2 sm:truncate">{company.name}</h1>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${company.active ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-500/15 text-slate-500'}`}>
                {company.active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-sm text-[var(--text-muted)]">Created {formatDate(company.createdAt)}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => openModal('invite')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm font-semibold text-white transition">
            <Plus size={16} /> Invite user
          </button>
          <button type="button" onClick={() => openModal('supplier')}
            className="inline-flex items-center gap-1.5 rounded-xl ring-1 ring-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--hover)] transition">
            <UserPlus size={16} /> Invite supplier
          </button>
          <div className="relative">
            <button type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}
              className="inline-flex items-center gap-1.5 rounded-xl ring-1 ring-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--hover)] transition">
              <MoreHorizontal size={16} /> <span className="hidden sm:inline">More actions</span>
              <ChevronDown size={14} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
                <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] shadow-lg p-1">
                  <button type="button" onClick={() => openModal('bulk')}
                    className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-left text-[var(--text)] hover:bg-[var(--hover)] transition">
                    <Upload size={15} className="text-[var(--text-muted)]" /> Bulk import users
                  </button>
                  <button type="button" onClick={() => openModal('supplierBulk')}
                    className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-left text-[var(--text)] hover:bg-[var(--hover)] transition">
                    <Upload size={15} className="text-[var(--text-muted)]" /> Bulk import suppliers
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map(k => <StatTile key={k.label} {...k} />)}
      </div>

      {/* ── Tabs ── */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`relative shrink-0 px-3 py-2.5 text-sm font-medium transition ${tab === t.key ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
            {t.label}
            {t.badge != null && <span className="ml-1.5 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">{t.badge}</span>}
            {tab === t.key && <i className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue-500" />}
          </button>
        ))}
      </div>

      {/* ── People tab ── */}
      {tab === 'people' && (
        <Card className="p-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 p-3">
            <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search people by name or email…" className="w-full sm:w-auto sm:min-w-[220px] sm:flex-1" />
            <FilterSelect label="Role" value={roleF} onChange={v => { setRoleF(v); setPage(1) }}
              options={[{ value: 'all', label: 'All' }, { value: 'executive', label: 'Executive' }, { value: 'regional_manager', label: 'Regional Manager' }, { value: 'store_manager', label: 'Store Manager' }]} />
            <FilterSelect label="Status" value={statusF} onChange={v => { setStatusF(v); setPage(1) }}
              options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'pending', label: 'Pending' }]} />
            <FilterSelect label="Project access" value={accessF} onChange={v => { setAccessF(v); setPage(1) }}
              options={[{ value: 'all', label: 'All' }, { value: 'full', label: 'Full access' }, { value: 'partial', label: 'Partial' }, { value: 'none', label: 'None' }]} />
            {filtersDirty && (
              <button type="button" onClick={resetFilters}
                className="inline-flex items-center gap-1.5 rounded-xl ring-1 ring-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-muted)] hover:bg-[var(--hover)] transition">
                <X size={14} /> Clear filters
              </button>
            )}
            <div className="ml-auto">
              <FilterSelect label="Sort by" value={sort} onChange={setSort}
                options={[{ value: 'name-asc', label: 'Name (A–Z)' }, { value: 'name-desc', label: 'Name (Z–A)' }, { value: 'recent', label: 'Last active' }, { value: 'status', label: 'Status' }]} />
            </div>
          </div>

          {/* Mobile: stacked cards (primary list must not sideways-scroll) */}
          <ul className="border-t border-[var(--border)] divide-y divide-[var(--border)] sm:hidden">
            {pageRows.map(u => (
              <li key={u.id} className="p-4 space-y-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CompanyAvatar name={u.name || u.email} size={34} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text)] break-words line-clamp-2">{u.name || '—'}</p>
                    <p className="text-xs text-[var(--text-muted)] break-all">{u.email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Role</p>
                    <p className="mt-0.5 text-sm text-[var(--text)]">{ROLE_META[u.role].label}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Last active</p>
                    <p className="mt-0.5 text-sm text-[var(--text-muted)]">{relativeActive(u.lastActive)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Project access</p>
                    <div className="mt-0.5"><AccessCell access={u.access} onView={() => setTab('access')} /></div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Status</p>
                    <div className="mt-0.5"><StatusCell active={!!u.lastActive} invitedAt={u.invitedAt} /></div>
                  </div>
                </div>
              </li>
            ))}
            {!pageRows.length && <li className="px-4 py-10 text-center text-sm text-[var(--text-faint)]">No people match these filters.</li>}
          </ul>

          {/* Desktop: table (secondary horizontal scroll only past sm) */}
          <div className="hidden overflow-x-auto border-t border-[var(--border)] sm:block">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
                  <th className="px-4 py-2.5 font-medium">Name &amp; email</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Project access</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Last active</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(u => (
                  <tr key={u.id} className="border-t border-[var(--border)] hover:bg-[var(--hover)] transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CompanyAvatar name={u.name || u.email} size={30} />
                        <div className="min-w-0">
                          <p className="text-sm text-[var(--text)] truncate">{u.name || '—'}</p>
                          <p className="text-xs text-[var(--text-muted)] truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-muted)] whitespace-nowrap">{ROLE_META[u.role].label}</td>
                    <td className="px-4 py-3"><AccessCell access={u.access} onView={() => setTab('access')} /></td>
                    <td className="px-4 py-3"><StatusCell active={!!u.lastActive} invitedAt={u.invitedAt} /></td>
                    <td className="px-4 py-3 text-sm text-[var(--text-muted)] whitespace-nowrap">{relativeActive(u.lastActive)}</td>
                  </tr>
                ))}
                {!pageRows.length && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--text-faint)]">No people match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)]">
            <span>{total ? `Showing ${start + 1} to ${Math.min(start + perPage, total)} of ${total} users` : 'No users'}</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={curPage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                className="grid h-10 w-10 place-items-center rounded-lg ring-1 ring-[var(--border)] disabled:opacity-40 hover:bg-[var(--hover)] transition sm:h-8 sm:w-8"><ChevronLeft size={15} /></button>
              <span className="grid h-10 min-w-10 place-items-center rounded-lg bg-blue-600 px-2 text-white sm:h-8 sm:min-w-8">{curPage}</span>
              <button type="button" disabled={curPage >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                className="grid h-10 w-10 place-items-center rounded-lg ring-1 ring-[var(--border)] disabled:opacity-40 hover:bg-[var(--hover)] transition sm:h-8 sm:w-8"><ChevronRight size={15} /></button>
              <label className="ml-2 flex items-center gap-1.5">
                <span className="hidden sm:inline text-[var(--text-faint)]">Rows per page</span>
                <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
                  className="h-10 rounded-lg bg-[var(--input-bg)] px-2 ring-1 ring-[var(--border)] text-[var(--text)] outline-none sm:h-8 sm:py-1.5">
                  {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
          </div>
        </Card>
      )}

      {/* ── Suppliers tab ── */}
      {tab === 'suppliers' && (
        <Card className="p-0 overflow-hidden">
          {suppliers.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {suppliers.map(s => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <CompanyAvatar name={s.name} size={30} />
                    <span className="truncate text-sm text-[var(--text)]">{s.name}</span>
                    {s.isMotiv && <span className="shrink-0 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">Motiv</span>}
                  </div>
                  <SupplierStatus s={s} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-[var(--text-faint)]">No suppliers linked to this account yet.</p>
          )}
        </Card>
      )}

      {/* ── Pending invitations tab ── */}
      {tab === 'pending' && (
        <Card className="p-0 overflow-hidden">
          {(pendingUsers.length + pendingSuppliers.length) ? (
            <ul className="divide-y divide-[var(--border)]">
              {pendingUsers.map(u => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <CompanyAvatar name={u.name || u.email} size={30} />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[var(--text)]">{u.name || u.email}</p>
                      <p className="truncate text-xs text-[var(--text-muted)]">{ROLE_META[u.role].label} · Invited {formatDate(u.invitedAt)}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">Pending</span>
                </li>
              ))}
              {pendingSuppliers.map(s => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <CompanyAvatar name={s.name} size={30} />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[var(--text)]">{s.name}</p>
                      <p className="truncate text-xs text-[var(--text-muted)]">Supplier{s.isMotiv ? ' · Motiv' : ''}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">Pending</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-[var(--text-faint)]">No pending invitations. Everyone has signed in.</p>
          )}
        </Card>
      )}

      {/* ── Project access tab (RM ↔ project assignment editor) ── */}
      {tab === 'access' && (
        <Card className="p-4 space-y-3">
          {!projects.length ? (
            <p className="py-6 text-center text-sm text-[var(--text-faint)]">This account has no projects yet.</p>
          ) : !rmUsers.length ? (
            <p className="py-6 text-center text-sm text-[var(--text-faint)]">No regional managers to assign. Executives have full access to all projects.</p>
          ) : (
            <>
              <p className="text-xs text-[var(--text-faint)]">Assign which projects each regional manager can access. Executives always see all projects.</p>
              {rmUsers.map(u => (
                <div key={u.id} className="rounded-xl bg-[var(--surface-2)] p-3">
                  <div className="flex items-center gap-2.5">
                    <CompanyAvatar name={u.name || u.email} size={28} />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[var(--text)]">{u.name || '—'}</p>
                      <p className="truncate text-xs text-[var(--text-muted)]">{u.email}</p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <RmProjectSelect companyId={company.id} rmUserId={u.id} projects={projects.map(p => ({ id: p.id, name: p.name }))} initial={u.projectIds} />
                  </div>
                </div>
              ))}
            </>
          )}
        </Card>
      )}

      {/* ── Modals ── */}
      {modal === 'invite' && <CompanyInviteModal companyId={company.id} companyName={company.name} regions={regions} projects={projects} onClose={() => setModal(null)} />}
      {modal === 'supplier' && <SupplierInviteModal companyId={company.id} companyName={company.name} onClose={() => setModal(null)} />}
      {modal === 'bulk' && <CompanyBulkImportModal companyName={company.name} onClose={() => setModal(null)} />}
      {modal === 'supplierBulk' && <SupplierBulkImportModal companyId={company.id} companyName={company.name} onClose={() => setModal(null)} />}
    </div>
  )
}
