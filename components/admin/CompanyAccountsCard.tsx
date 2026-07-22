'use client'

import { useState } from 'react'
import { ChevronDown, Crown, Building2, Store, Truck, UserPlus, Upload, ShieldCheck, MoreHorizontal } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { formatDate } from '@/lib/utils'
import { CompanyAvatar } from './CompanyAvatar'
import { CompanyInviteModal } from './CompanyInviteModal'
import { CompanyBulkImportModal } from './CompanyBulkImportModal'
import { SupplierInviteModal } from './SupplierInviteModal'
import { SupplierBulkImportModal } from './SupplierBulkImportModal'
import { RmProjectSelect } from './RmProjectSelect'
import type { RegionOpt, ProjectOpt } from './AddAccountForm'

export type MemberRow = {
  id: string
  name: string
  email: string
  role: 'executive' | 'regional_manager' | 'store_manager'
  location: string
  lastSignIn: string | null
  /** RM only: project ids this RM is assigned to (per-RM project access). */
  projectIds?: string[]
}
export type SupplierRow = { id: string; name: string; verified: boolean; isMotiv: boolean; pending: boolean }
export type CompanyGroup = {
  id: string
  name: string
  logoUrl: string | null
  members: MemberRow[]
  suppliers: SupplierRow[]
}

const ROLE_META = {
  executive: { label: 'Executive', plural: 'Executives', Icon: Crown },
  regional_manager: { label: 'Regional Manager', plural: 'Regional Managers', Icon: Building2 },
  store_manager: { label: 'Store Manager', plural: 'Store Managers', Icon: Store },
} as const
const ROLE_ORDER = ['executive', 'regional_manager', 'store_manager'] as const

type Filter = null | 'executive' | 'regional_manager' | 'store_manager' | 'companySupplier' | 'motivSupplier'
type ModalKind = 'invite' | 'bulk' | 'supplier' | 'supplierBulk'

const ACTIONS: { key: ModalKind; label: string; Icon: React.ElementType; primary: boolean }[] = [
  { key: 'invite', label: 'Invite account', Icon: UserPlus, primary: true },
  { key: 'bulk', label: 'Bulk import', Icon: Upload, primary: false },
  { key: 'supplier', label: 'Invite supplier', Icon: Truck, primary: true },
  { key: 'supplierBulk', label: 'Bulk suppliers', Icon: Upload, primary: false },
]

function daysAgo(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000)
}

function CountChip({ Icon, label, total, pending }: { Icon: React.ElementType; label: string; total: number; pending: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-2)] ring-1 ring-[var(--border)] px-2 py-1 text-xs">
      <Icon size={13} className="text-[var(--text-muted)]" />
      <span className="font-semibold text-[var(--text)]">{total}</span>
      <span className="hidden sm:inline text-[var(--text-faint)]">{label}</span>
      {pending > 0 && <span className="text-amber-600 dark:text-amber-400" title={`${pending} invited, not signed in yet`}>· {pending} pending</span>}
    </span>
  )
}

function LastSignIn({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-amber-600 dark:text-amber-400">Pending</span>
  const d = daysAgo(iso)
  const recent = d != null && d <= 7
  return (
    <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
      <i className={`h-1.5 w-1.5 rounded-full ${recent ? 'bg-emerald-500' : 'bg-slate-400/60'}`} />
      {formatDate(iso)}{d != null && <span className="text-[var(--text-faint)]">· {d === 0 ? 'today' : `${d}d`}</span>}
    </span>
  )
}

function SupplierItem({ s }: { s: SupplierRow }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm">
      <div className="min-w-0 flex items-center gap-2">
        <CompanyAvatar name={s.name} size={26} />
        <span className="text-[var(--text)] truncate">{s.name}</span>
        {s.isMotiv && <span className="shrink-0 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 text-[10px] font-medium">Motiv</span>}
      </div>
      <span className="shrink-0 text-xs whitespace-nowrap">
        {s.pending ? <span className="text-amber-600 dark:text-amber-400">Pending</span>
          : s.verified ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><ShieldCheck size={13} /> Verified</span>
          : <span className="text-[var(--text-muted)]">Active</span>}
      </span>
    </li>
  )
}

function SupplierSubsection({ title, rows }: { title: string; rows: SupplierRow[] }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">
        <Truck size={13} /> {title} ({rows.length})
      </div>
      {rows.length
        ? <ul className="space-y-1">{rows.map(s => <SupplierItem key={s.id} s={s} />)}</ul>
        : <p className="text-sm text-[var(--text-faint)]">None yet.</p>}
    </div>
  )
}

export function CompanyAccountsCard({ group, regions, projects, defaultOpen = false }: { group: CompanyGroup; regions: RegionOpt[]; projects: ProjectOpt[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [modal, setModal] = useState<null | ModalKind>(null)
  const [filter, setFilter] = useState<Filter>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const byRole = (r: MemberRow['role']) => group.members.filter(m => m.role === r)
  const pendingOf = (rows: MemberRow[]) => rows.filter(m => !m.lastSignIn).length
  const supplierPending = group.suppliers.filter(s => s.pending).length
  const companySuppliers = group.suppliers.filter(s => !s.isMotiv)
  const motivSuppliers = group.suppliers.filter(s => s.isMotiv)
  const roleFilterActive = filter !== null && filter !== 'companySupplier' && filter !== 'motivSupplier'

  const kpis: { key: Exclude<Filter, null>; label: string; count: number; Icon: React.ElementType }[] = [
    { key: 'executive', label: 'Executives', count: byRole('executive').length, Icon: ROLE_META.executive.Icon },
    { key: 'regional_manager', label: 'Regional Managers', count: byRole('regional_manager').length, Icon: ROLE_META.regional_manager.Icon },
    { key: 'store_manager', label: 'Store Managers', count: byRole('store_manager').length, Icon: ROLE_META.store_manager.Icon },
    { key: 'companySupplier', label: 'Company Suppliers', count: companySuppliers.length, Icon: Truck },
    { key: 'motivSupplier', label: 'Motiv Suppliers', count: motivSuppliers.length, Icon: Truck },
  ]

  const openModal = (k: ModalKind) => { setModal(k); setMenuOpen(false) }

  return (
    <Card className="p-0 overflow-hidden">
      {/* Header: left = collapsible title button, right = actions cluster (outside the collapse button) */}
      <div className="flex items-center">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          className="min-w-0 flex-1 flex items-center gap-3 p-4 text-left hover:bg-[var(--hover)] transition">
          <CompanyAvatar name={group.name} logoUrl={group.logoUrl} size={44} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[var(--text)] truncate">{group.name}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ROLE_ORDER.map(r => {
                const rows = byRole(r)
                return <CountChip key={r} Icon={ROLE_META[r].Icon} label={ROLE_META[r].plural} total={rows.length} pending={pendingOf(rows)} />
              })}
              <CountChip Icon={Truck} label="Suppliers" total={group.suppliers.length} pending={supplierPending} />
            </div>
          </div>
          <ChevronDown size={18} className={`shrink-0 text-[var(--text-faint)] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        <div className="relative shrink-0 self-stretch flex items-center pl-1 pr-3 sm:pr-4">
          {/* sm+: full labelled buttons */}
          <div className="hidden sm:flex flex-wrap justify-end gap-2 max-w-[26rem]">
            {ACTIONS.map(a => (
              <button key={a.key} type="button" onClick={() => openModal(a.key)}
                className={a.primary
                  ? 'inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm font-semibold text-white transition'
                  : 'inline-flex items-center gap-1.5 rounded-xl ring-1 ring-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--hover)] transition'}>
                <a.Icon size={15} /> {a.label}
              </button>
            ))}
          </div>

          {/* base: compact overflow menu */}
          <div className="sm:hidden">
            <button type="button" aria-label="Account actions" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)] transition">
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
                <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] shadow-lg p-1">
                  {ACTIONS.map(a => (
                    <button key={a.key} type="button" onClick={() => openModal(a.key)}
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-left text-[var(--text)] hover:bg-[var(--hover)] transition">
                      <a.Icon size={15} className="text-[var(--text-muted)]" /> {a.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-[var(--border)] p-4 space-y-4">
          {/* KPI filter cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {kpis.map(k => {
              const active = filter === k.key
              return (
                <button key={k.key} type="button" onClick={() => setFilter(f => f === k.key ? null : k.key)}
                  aria-pressed={active}
                  className={`min-h-11 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-left transition ${active ? 'ring-2 ring-blue-500' : 'ring-1 ring-[var(--border)] hover:bg-[var(--hover)]'}`}>
                  <div className="flex items-center gap-1.5 text-[var(--text-faint)]">
                    <k.Icon size={13} className="shrink-0" />
                    <span className="text-[10px] uppercase tracking-wide leading-tight truncate">{k.label}</span>
                  </div>
                  <p className="mt-0.5 text-xl font-semibold text-[var(--text)]">{k.count}</p>
                </button>
              )
            })}
          </div>

          {/* Account groups */}
          {ROLE_ORDER.map(r => {
            if (filter && filter !== r) return null
            const rows = byRole(r)
            if (!rows.length) return null
            const { Icon, plural } = ROLE_META[r]
            return (
              <div key={r}>
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">
                  <Icon size={13} /> {plural} ({rows.length})
                </div>
                <ul className="space-y-1">
                  {rows.map(m => (
                    <li key={m.id} className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[var(--text)] truncate">{m.name || '—'}</p>
                          <p className="text-xs text-[var(--text-muted)] break-all sm:break-normal sm:truncate">{m.email}{m.location !== '—' && <span className="text-[var(--text-faint)]"> · {m.location}</span>}</p>
                        </div>
                        <span className="shrink-0 text-xs whitespace-nowrap"><LastSignIn iso={m.lastSignIn} /></span>
                      </div>
                      {m.role === 'regional_manager' && projects.length > 0 && (
                        <div className="mt-2">
                          <RmProjectSelect companyId={group.id} rmUserId={m.id} projects={projects.map(p => ({ id: p.id, name: p.name }))} initial={m.projectIds ?? []} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}

          {/* Suppliers — always split into Company + Motiv subsections (hidden when a role or the other supplier filter is active) */}
          {!roleFilterActive && (
            <div className="space-y-3">
              {filter !== 'motivSupplier' && <SupplierSubsection title="Company suppliers" rows={companySuppliers} />}
              {filter !== 'companySupplier' && <SupplierSubsection title="Motiv suppliers" rows={motivSuppliers} />}
            </div>
          )}
        </div>
      )}

      {modal === 'invite' && <CompanyInviteModal companyId={group.id} companyName={group.name} regions={regions} projects={projects} onClose={() => setModal(null)} />}
      {modal === 'bulk' && <CompanyBulkImportModal companyName={group.name} onClose={() => setModal(null)} />}
      {modal === 'supplier' && <SupplierInviteModal companyId={group.id} companyName={group.name} onClose={() => setModal(null)} />}
      {modal === 'supplierBulk' && <SupplierBulkImportModal companyId={group.id} companyName={group.name} onClose={() => setModal(null)} />}
    </Card>
  )
}
