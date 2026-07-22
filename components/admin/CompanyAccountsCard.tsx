'use client'

import { useState } from 'react'
import { ChevronDown, Crown, Building2, Store, Truck, UserPlus, Upload, ShieldCheck } from 'lucide-react'
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

export function CompanyAccountsCard({ group, regions, projects, defaultOpen = false }: { group: CompanyGroup; regions: RegionOpt[]; projects: ProjectOpt[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [modal, setModal] = useState<null | 'invite' | 'bulk' | 'supplier' | 'supplierBulk'>(null)

  const byRole = (r: MemberRow['role']) => group.members.filter(m => m.role === r)
  const pendingOf = (rows: MemberRow[]) => rows.filter(m => !m.lastSignIn).length
  const supplierPending = group.suppliers.filter(s => s.pending).length

  return (
    <Card className="p-0 overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-[var(--hover)] transition">
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

      {open && (
        <div className="border-t border-[var(--border)] p-4 space-y-4">
          {/* Account groups */}
          {ROLE_ORDER.map(r => {
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

          {/* Suppliers */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">
              <Truck size={13} /> Suppliers ({group.suppliers.length})
            </div>
            {group.suppliers.length ? (
              <ul className="space-y-1">
                {group.suppliers.map(s => (
                  <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm">
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
                ))}
              </ul>
            ) : <p className="text-sm text-[var(--text-faint)]">No suppliers invited yet.</p>}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => setModal('invite')} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm font-semibold text-white transition">
              <UserPlus size={15} /> Invite account
            </button>
            <button type="button" onClick={() => setModal('bulk')} className="inline-flex items-center gap-1.5 rounded-xl ring-1 ring-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--hover)] transition">
              <Upload size={15} /> Bulk import
            </button>
            <button type="button" onClick={() => setModal('supplier')} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm font-semibold text-white transition">
              <Truck size={15} /> Invite supplier
            </button>
            <button type="button" onClick={() => setModal('supplierBulk')} className="inline-flex items-center gap-1.5 rounded-xl ring-1 ring-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--hover)] transition">
              <Upload size={15} /> Bulk suppliers
            </button>
          </div>
        </div>
      )}

      {modal === 'invite' && <CompanyInviteModal companyId={group.id} companyName={group.name} regions={regions} projects={projects} onClose={() => setModal(null)} />}
      {modal === 'bulk' && <CompanyBulkImportModal companyName={group.name} onClose={() => setModal(null)} />}
      {modal === 'supplier' && <SupplierInviteModal companyId={group.id} companyName={group.name} onClose={() => setModal(null)} />}
      {modal === 'supplierBulk' && <SupplierBulkImportModal companyId={group.id} companyName={group.name} onClose={() => setModal(null)} />}
    </Card>
  )
}
