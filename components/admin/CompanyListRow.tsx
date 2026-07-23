'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { User, UsersRound, Store, Truck, Clock, UserPlus, Pencil, Ban, RotateCcw } from 'lucide-react'
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

const TINT: Record<string, string> = {
  blue: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  slate: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  purple: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
}

function StatCol({ Icon, tint, value, label }: { Icon: React.ElementType; tint: keyof typeof TINT; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TINT[tint]}`}><Icon size={15} /></span>
      <div>
        <p className="text-base font-bold leading-none text-[var(--text)]">{value}</p>
        <p className="mt-0.5 whitespace-nowrap text-[10px] uppercase leading-tight tracking-wide text-[var(--text-faint)]">{label}</p>
      </div>
    </div>
  )
}

function Chip({ Icon, text, amber = false }: { Icon: React.ElementType; text: string; amber?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-[11px] ${amber ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--text-muted)]'}`}>
      <Icon size={12} /> {text}
    </span>
  )
}

export function CompanyListRow({ item, regions, projects }: { item: CompanyListItem; regions: RegionOpt[]; projects: ProjectOpt[] }) {
  const router = useRouter()
  const [modal, setModal] = useState<null | 'invite' | 'edit'>(null)
  const [busy, setBusy] = useState(false)
  const href = `/admin/accounts/${item.id}`
  const totalUsers = item.counts.executive + item.counts.regional_manager + item.counts.store_manager

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

  const actions = (
    <MoreMenu iconOnly label="Company actions">
      <MoreActionItem icon={<UserPlus size={16} />} label="Invite user" onClick={() => setModal('invite')} />
      <MoreActionItem icon={<Pencil size={16} />} label="Edit company" onClick={() => setModal('edit')} />
      {item.active
        ? <MoreActionItem icon={<Ban size={16} />} label="Deactivate company" tone="danger" onClick={toggleActive} />
        : <MoreActionItem icon={<RotateCcw size={16} />} label="Reactivate company" onClick={toggleActive} />}
    </MoreMenu>
  )

  return (
    <Card className={`relative p-4 transition hover:bg-[var(--hover)] ${item.active ? '' : 'opacity-60'}`}>
      {/* Whole row links to the company page, except the action island (z-20). */}
      <Link href={href} aria-label={`Open ${item.name}`} className="absolute inset-0 z-10 rounded-2xl" />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Identity + (mobile) actions */}
        <div className="flex min-w-0 items-start gap-3 lg:flex-1">
          <CompanyAvatar name={item.name} logoUrl={item.logoUrl} size={44} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[var(--text)] break-words line-clamp-2 sm:truncate">{item.name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 font-medium ${item.active ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-500/15 text-slate-500'}`}>{item.active ? 'Active' : 'Inactive'}</span>
              <span className="text-[var(--text-faint)]">· Created {formatDate(item.createdAt)}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Chip Icon={UsersRound} text={`${totalUsers} user${totalUsers === 1 ? '' : 's'}`} />
              <Chip Icon={Truck} text={`${item.counts.supplier} supplier${item.counts.supplier === 1 ? '' : 's'}`} />
              <Chip Icon={Clock} amber={item.pending > 0} text={`${item.pending} pending invite${item.pending === 1 ? '' : 's'}`} />
            </div>
          </div>
          <div className="relative z-20 shrink-0 lg:hidden">{actions}</div>
        </div>

        {/* Stats (wrap on mobile; inline on desktop) */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-[var(--border)] pt-3 lg:border-0 lg:pt-0">
          <StatCol Icon={User} tint="blue" value={item.counts.executive} label="Executive" />
          <StatCol Icon={UsersRound} tint="emerald" value={item.counts.regional_manager} label="Regional Managers" />
          <StatCol Icon={Store} tint="slate" value={item.counts.store_manager} label="Store Managers" />
          <StatCol Icon={Truck} tint="purple" value={item.counts.supplier} label="Suppliers" />
          <StatCol Icon={Clock} tint="amber" value={item.pending} label="Pending Invites" />
        </div>

        {/* Last active */}
        <div className="hidden text-right xl:block">
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Last active</p>
          <p className="text-xs text-[var(--text-muted)]">{item.lastActive ? formatDate(item.lastActive) : '—'}</p>
        </div>

        {/* Actions (desktop) */}
        <div className="relative z-20 hidden shrink-0 lg:block">{actions}</div>
      </div>

      {busy && <span className="sr-only">Working…</span>}
      {modal === 'invite' && <CompanyInviteModal companyId={item.id} companyName={item.name} regions={regions} projects={projects} onClose={() => setModal(null)} />}
      {modal === 'edit' && <CreateCompanyModal company={{ id: item.id, name: item.name }} onClose={() => setModal(null)} />}
    </Card>
  )
}
