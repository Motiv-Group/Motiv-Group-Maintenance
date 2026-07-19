'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UserPlus, ArrowRight, Pencil, Ban, RotateCcw } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { CompanyAvatar } from './CompanyAvatar'
import { CompanyInviteModal } from './CompanyInviteModal'
import { CreateCompanyModal } from './CreateCompanyModal'
import { MoreMenu, MoreActionItem } from '@/components/regional/rm-actions/ticket'
import { formatDate } from '@/lib/utils'
import { errMsg } from '@/components/ui/errMsg'
import type { RegionOpt, ProjectOpt } from './AddAccountForm'

export type CompanyListItem = {
  id: string
  name: string
  logoUrl: string | null
  createdAt: string
  active: boolean
  counts: { executive: number; regional_manager: number; store_manager: number; supplier: number }
  pending: number
  lastActive: string | null
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold leading-none text-[var(--text)]">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--text-faint)]">{label}</p>
    </div>
  )
}

export function CompanyListRow({ item, regions, projects }: { item: CompanyListItem; regions: RegionOpt[]; projects: ProjectOpt[] }) {
  const router = useRouter()
  const [modal, setModal] = useState<null | 'invite' | 'edit'>(null)
  const [busy, setBusy] = useState(false)
  const href = `/admin/accounts/${item.id}`

  async function toggleActive() {
    const action = item.active ? 'deactivate_company' : 'reactivate_company'
    if (item.active && !confirm(`Deactivate ${item.name}? Its users won’t be able to sign in until you reactivate it.`)) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, companyId: item.id }) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(errMsg(new Error(d.error ?? 'Failed'))) }
      router.refresh()
    } catch (e) { alert(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <Card className={`relative p-4 transition hover:bg-[var(--hover)] ${item.active ? '' : 'opacity-60'}`}>
      {/* Whole row links to the company page, except the action island (z-20). */}
      <Link href={href} aria-label={`Open ${item.name}`} className="absolute inset-0 z-10 rounded-2xl" />

      <div className="flex items-center gap-3">
        <CompanyAvatar name={item.name} logoUrl={item.logoUrl} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--text)] truncate">{item.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 font-medium ${item.active ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-500/15 text-slate-500'}`}>{item.active ? 'Active' : 'Inactive'}</span>
            <span className="text-[var(--text-faint)]">· Created {formatDate(item.createdAt)}</span>
          </p>
        </div>

        {/* Stats — hidden on the smallest screens to keep the row clean. */}
        <div className="hidden sm:flex items-center gap-5 pr-1">
          <Stat label="Exec" value={item.counts.executive} />
          <Stat label="RM" value={item.counts.regional_manager} />
          <Stat label="SM" value={item.counts.store_manager} />
          <Stat label="Suppliers" value={item.counts.supplier} />
          {item.pending > 0 && (
            <div className="text-center"><p className="text-lg font-bold leading-none text-amber-600 dark:text-amber-400">{item.pending}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Pending</p></div>
          )}
        </div>

        <div className="hidden lg:block pr-1 text-right">
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Last active</p>
          <p className="text-xs text-[var(--text-muted)]">{item.lastActive ? formatDate(item.lastActive) : '—'}</p>
        </div>

        {/* Action island */}
        <div className="relative z-20 flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => setModal('invite')} className="hidden sm:inline-flex items-center gap-1.5 rounded-lg ring-1 ring-blue-500/50 px-2.5 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition">
            <UserPlus size={14} /> Invite user
          </button>
          <Link href={href} className="hidden sm:inline-flex items-center gap-1.5 rounded-lg ring-1 ring-[var(--border)] px-2.5 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--hover)] transition">
            View company <ArrowRight size={13} />
          </Link>
          <MoreMenu>
            <MoreActionItem icon={<UserPlus size={16} />} label="Invite user" onClick={() => setModal('invite')} />
            <MoreActionItem icon={<Pencil size={16} />} label="Edit company" onClick={() => setModal('edit')} />
            {item.active
              ? <MoreActionItem icon={<Ban size={16} />} label="Deactivate company" tone="danger" onClick={toggleActive} />
              : <MoreActionItem icon={<RotateCcw size={16} />} label="Reactivate company" onClick={toggleActive} />}
          </MoreMenu>
        </div>
      </div>

      {/* Mobile stat strip */}
      <div className="sm:hidden mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3 text-center relative z-20 pointer-events-none">
        <Stat label="Exec" value={item.counts.executive} />
        <Stat label="RM" value={item.counts.regional_manager} />
        <Stat label="SM" value={item.counts.store_manager} />
        <Stat label="Suppliers" value={item.counts.supplier} />
        {item.pending > 0 && <div><p className="text-lg font-bold leading-none text-amber-600 dark:text-amber-400">{item.pending}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Pending</p></div>}
      </div>

      {busy && <span className="sr-only">Working…</span>}
      {modal === 'invite' && <CompanyInviteModal companyId={item.id} companyName={item.name} regions={regions} projects={projects} onClose={() => setModal(null)} />}
      {modal === 'edit' && <CreateCompanyModal company={{ id: item.id, name: item.name }} onClose={() => setModal(null)} />}
    </Card>
  )
}
