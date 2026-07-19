export const dynamic = 'force-dynamic'

import { UsersRound, User } from 'lucide-react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { Card } from '@/components/exec/ui'
import { InfoTip } from '@/components/ui/InfoTip'
import { CreateCompanyButton } from '@/components/admin/CreateCompanyButton'
import { CompanyListRow, type CompanyListItem } from '@/components/admin/CompanyListRow'
import type { RegionOpt, ProjectOpt } from '@/components/admin/AddAccountForm'

async function loadLastSignIns(admin: ReturnType<typeof createAdminClient>): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    const list = data?.users ?? []
    if (error || !list.length) break
    for (const u of list) map.set(u.id, u.last_sign_in_at ?? null)
    if (list.length < 1000) break
  }
  return map
}

const daysAgo = (iso: string | null): number | null => {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000)
}

export default async function AdminAccountsPage() {
  await requireMasterAdmin()
  const db = createAdminClient()
  const [
    { data: companies }, { data: regions }, { data: users }, { data: projects },
    { data: links }, { data: individuals },
  ] = await Promise.all([
    db.from('companies').select('id, name, logo_url, created_at, active').order('active', { ascending: false }).order('name'),
    db.from('regions').select('id, name, region_code, company_id').eq('active', true).order('name'),
    db.from('user_profiles').select('id, role, company_id').in('role', ['executive', 'regional_manager', 'store_manager']),
    db.from('projects').select('id, name, company_id').is('archived_at', null).order('name'),
    db.from('company_suppliers').select('company_id, supplier_id'),
    db.from('user_profiles').select('id').eq('role', 'individual').eq('active', true),
  ])

  const regionOpts: RegionOpt[] = (regions ?? []).map(r => ({ id: r.id, name: r.name, companyId: r.company_id, code: r.region_code }))
  const projectOpts: ProjectOpt[] = (projects ?? []).map(p => ({ id: p.id, name: p.name, companyId: p.company_id }))

  const signIns = await loadLastSignIns(db)

  // Per-company aggregates from the user set.
  type Agg = { executive: number; regional_manager: number; store_manager: number; pending: number; lastActive: number }
  const agg = new Map<string, Agg>()
  for (const u of (users ?? [])) {
    if (!u.company_id) continue
    const a = agg.get(u.company_id) ?? { executive: 0, regional_manager: 0, store_manager: 0, pending: 0, lastActive: 0 }
    a[u.role as 'executive' | 'regional_manager' | 'store_manager']++
    const si = signIns.get(u.id) ?? null
    if (!si) a.pending++
    else { const t = new Date(si).getTime(); if (!Number.isNaN(t) && t > a.lastActive) a.lastActive = t }
    agg.set(u.company_id, a)
  }
  const supplierCount = new Map<string, number>()
  for (const l of (links ?? [])) supplierCount.set(l.company_id, (supplierCount.get(l.company_id) ?? 0) + 1)

  const items: CompanyListItem[] = (companies ?? []).map(c => {
    const a = agg.get(c.id) ?? { executive: 0, regional_manager: 0, store_manager: 0, pending: 0, lastActive: 0 }
    return {
      id: c.id, name: c.name, logoUrl: c.logo_url ?? null, createdAt: c.created_at, active: c.active,
      counts: { executive: a.executive, regional_manager: a.regional_manager, store_manager: a.store_manager, supplier: supplierCount.get(c.id) ?? 0 },
      pending: a.pending,
      lastActive: a.lastActive ? new Date(a.lastActive).toISOString() : null,
    }
  })

  const totalAccounts = (users ?? []).length
  const indIds = (individuals ?? []).map(i => i.id)
  const indActiveWeek = indIds.filter(id => { const d = daysAgo(signIns.get(id) ?? null); return d != null && d <= 7 }).length

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
            <UsersRound className="text-blue-600 dark:text-blue-400" size={22} /> Accounts
            <InfoTip title="Accounts" align="left">One row per company. Open a company to see its Executives, Regional Managers, Store Managers and Suppliers and to invite more — individually or by bulk CSV. Individuals and self-signup suppliers register themselves.</InfoTip>
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">{companies?.length ?? 0} companies · {totalAccounts} accounts</p>
        </div>
        <CreateCompanyButton />
      </div>

      {/* Individuals — self-signup standalone accounts, not under any company. */}
      <Card className="p-4 flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-500/15 text-slate-600 dark:text-slate-300"><User size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--text)]">Individuals</p>
          <p className="text-xs text-[var(--text-muted)]">Public self-signup · standalone jobs, no company</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-bold text-[var(--text)]">{indIds.length}</p>
          <p className="text-[11px] text-[var(--text-faint)]"><span className="text-emerald-600 dark:text-emerald-400">{indActiveWeek} active this week</span></p>
        </div>
      </Card>

      <div className="space-y-2.5">
        {items.map(item => <CompanyListRow key={item.id} item={item} regions={regionOpts} projects={projectOpts} />)}
        {!items.length && (
          <Card className="p-8 text-center"><p className="text-sm text-[var(--text-muted)]">No companies yet. Create one to start inviting accounts.</p></Card>
        )}
      </div>
    </div>
  )
}
