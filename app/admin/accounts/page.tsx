export const dynamic = 'force-dynamic'

import { UsersRound, User } from 'lucide-react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { Card } from '@/components/exec/ui'
import { InfoTip } from '@/components/ui/InfoTip'
import { CreateCompanyButton } from '@/components/admin/CreateCompanyButton'
import { CompanyAccountsCard, type CompanyGroup, type MemberRow, type SupplierRow } from '@/components/admin/CompanyAccountsCard'
import type { RegionOpt, ProjectOpt } from '@/components/admin/AddAccountForm'

type Role = MemberRow['role']

// Last sign-in per user comes from Supabase auth (last_sign_in_at). Paginate
// defensively (perPage caps at 1000).
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
    { data: companies }, { data: regions }, { data: users }, { data: ru }, { data: su },
    { data: stores }, { data: projects }, { data: links }, { data: suppliers }, { data: supUsers },
    { data: individuals },
  ] = await Promise.all([
    db.from('companies').select('id, name, logo_url').eq('active', true).order('name'),
    db.from('regions').select('id, name, region_code, company_id').eq('active', true).order('name'),
    db.from('user_profiles').select('id, full_name, email, role, company_id').in('role', ['executive', 'regional_manager', 'store_manager']).eq('active', true),
    db.from('regional_users').select('user_id, region_id'),
    db.from('store_users').select('user_id, store_id'),
    db.from('stores').select('id, branch_code, region_id'),
    db.from('projects').select('id, name, company_id').is('archived_at', null).order('name'),
    db.from('company_suppliers').select('company_id, supplier_id'),
    db.from('suppliers').select('id, company_name, verification_status, source, is_motiv'),
    db.from('supplier_users').select('user_id, supplier_id'),
    db.from('user_profiles').select('id').eq('role', 'individual').eq('active', true),
  ])

  const regionOpts: RegionOpt[] = (regions ?? []).map(r => ({ id: r.id, name: r.name, companyId: r.company_id, code: r.region_code }))
  const projectOpts: ProjectOpt[] = (projects ?? []).map(p => ({ id: p.id, name: p.name, companyId: p.company_id }))

  // Per-user "Region / Branch": RMs → region name(s); SMs → store branch code.
  const regionLabelById = new Map((regions ?? []).map(r => [r.id, `${r.name} (${r.region_code})`]))
  const storeById = new Map((stores ?? []).map(s => [s.id, s]))
  const rmRegions = new Map<string, string[]>()
  for (const r of (ru ?? [])) { const a = rmRegions.get(r.user_id) ?? []; const l = regionLabelById.get(r.region_id); if (l) a.push(l); rmRegions.set(r.user_id, a) }
  const smBranch = new Map<string, string>()
  for (const s of (su ?? [])) { const store = storeById.get(s.store_id); if (store?.branch_code && !smBranch.has(s.user_id)) smBranch.set(s.user_id, store.branch_code) }

  const signIns = await loadLastSignIns(db)

  const locationFor = (role: Role, id: string): string => {
    if (role === 'regional_manager') return (rmRegions.get(id) ?? []).join(', ') || '—'
    if (role === 'store_manager') return smBranch.get(id) ?? '—'
    return '—'
  }

  // Supplier → its member user ids, to decide "pending" (no member has signed in).
  const supplierUserIds = new Map<string, string[]>()
  for (const su2 of (supUsers ?? [])) { const a = supplierUserIds.get(su2.supplier_id) ?? []; a.push(su2.user_id); supplierUserIds.set(su2.supplier_id, a) }
  const supplierById = new Map((suppliers ?? []).map(s => [s.id, s]))
  const supplierActive = (supplierId: string) => (supplierUserIds.get(supplierId) ?? []).some(uid => !!signIns.get(uid))

  // Company → linked supplier rows.
  const companySupplierIds = new Map<string, string[]>()
  for (const l of (links ?? [])) { const a = companySupplierIds.get(l.company_id) ?? []; a.push(l.supplier_id); companySupplierIds.set(l.company_id, a) }

  // Build per-company groups (every active company, even with no members yet).
  const membersByCompany = new Map<string, MemberRow[]>()
  for (const u of (users ?? [])) {
    if (!u.company_id) continue
    const a = membersByCompany.get(u.company_id) ?? []
    a.push({ id: u.id, name: u.full_name ?? '', email: u.email ?? '—', role: u.role as Role, location: locationFor(u.role as Role, u.id), lastSignIn: signIns.get(u.id) ?? null })
    membersByCompany.set(u.company_id, a)
  }

  const groups: CompanyGroup[] = (companies ?? []).map(c => {
    const supplierRows: SupplierRow[] = (companySupplierIds.get(c.id) ?? [])
      .map(sid => supplierById.get(sid)).filter((s): s is NonNullable<typeof s> => !!s)
      .map(s => ({ id: s.id, name: s.company_name, verified: s.verification_status === 'verified', isMotiv: s.source === 'self_signup' || s.source === 'motiv_invite' || s.is_motiv === true, pending: !supplierActive(s.id) }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return { id: c.id, name: c.name, logoUrl: c.logo_url ?? null, members: membersByCompany.get(c.id) ?? [], suppliers: supplierRows }
  })

  const totalAccounts = (users ?? []).length
  const activeWeek = (users ?? []).filter(u => { const d = daysAgo(signIns.get(u.id) ?? null); return d != null && d <= 7 }).length
  const neverSignedIn = (users ?? []).filter(u => !signIns.get(u.id)).length

  // Individuals (self-signup standalone accounts) — one summary block.
  const indIds = (individuals ?? []).map(i => i.id)
  const indActiveWeek = indIds.filter(id => { const d = daysAgo(signIns.get(id) ?? null); return d != null && d <= 7 }).length
  const indNever = indIds.filter(id => !signIns.get(id)).length

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
            <UsersRound className="text-blue-600 dark:text-blue-400" size={22} /> Accounts
            <InfoTip title="Accounts" align="left">Companies group everyone you invite. Create a company, then open its card to invite Executives, Regional Managers, Store Managers and Suppliers — individually or by bulk CSV. Individuals and self-signup suppliers register themselves.</InfoTip>
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {companies?.length ?? 0} companies · {totalAccounts} accounts
            <span className="text-emerald-600 dark:text-emerald-400"> · {activeWeek} active this week</span>
            {neverSignedIn > 0 && <span className="text-amber-600 dark:text-amber-400"> · {neverSignedIn} pending</span>}
          </p>
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
          <p className="text-[11px] text-[var(--text-faint)]">
            <span className="text-emerald-600 dark:text-emerald-400">{indActiveWeek} active</span>{indNever > 0 && <> · {indNever} never</>}
          </p>
        </div>
      </Card>

      {/* Companies */}
      <div className="space-y-3">
        {groups.map(g => <CompanyAccountsCard key={g.id} group={g} regions={regionOpts} projects={projectOpts} />)}
        {!groups.length && (
          <Card className="p-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">No companies yet. Create one to start inviting accounts.</p>
          </Card>
        )}
      </div>
    </div>
  )
}
