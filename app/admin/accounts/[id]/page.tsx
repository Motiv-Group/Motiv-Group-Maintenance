export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { BackLink } from '@/components/ui/BackLink'
import { CompanyAvatar } from '@/components/admin/CompanyAvatar'
import { CompanyAccountsCard, type CompanyGroup, type MemberRow, type SupplierRow } from '@/components/admin/CompanyAccountsCard'
import type { RegionOpt, ProjectOpt } from '@/components/admin/AddAccountForm'
import { formatDate } from '@/lib/utils'

type Role = MemberRow['role']

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

export default async function AdminCompanyDetailPage(props: { params: Promise<{ id: string }> }) {
  await requireMasterAdmin()
  const { id } = await props.params
  const db = createAdminClient()

  const { data: company } = await db.from('companies').select('id, name, logo_url, created_at, active').eq('id', id).single()
  if (!company) notFound()

  const [{ data: regions }, { data: users }, { data: ru }, { data: su }, { data: stores }, { data: projects }, { data: links }, { data: supUsers }] = await Promise.all([
    db.from('regions').select('id, name, region_code, company_id').eq('active', true).order('name'),
    db.from('user_profiles').select('id, full_name, email, role, company_id').eq('company_id', id).in('role', ['executive', 'regional_manager', 'store_manager']),
    db.from('regional_users').select('user_id, region_id'),
    db.from('store_users').select('user_id, store_id'),
    db.from('stores').select('id, branch_code, region_id'),
    db.from('projects').select('id, name, company_id').is('archived_at', null).order('name'),
    db.from('company_suppliers').select('company_id, supplier_id').eq('company_id', id),
    db.from('supplier_users').select('user_id, supplier_id'),
  ])

  const supplierIds = (links ?? []).map(l => l.supplier_id)
  const { data: suppliers } = supplierIds.length
    ? await db.from('suppliers').select('id, company_name, verification_status, source, is_motiv').in('id', supplierIds)
    : { data: [] as { id: string; company_name: string; verification_status: string; source: string; is_motiv: boolean }[] }

  const regionOpts: RegionOpt[] = (regions ?? []).map(r => ({ id: r.id, name: r.name, companyId: r.company_id, code: r.region_code }))
  const projectOpts: ProjectOpt[] = (projects ?? []).map(p => ({ id: p.id, name: p.name, companyId: p.company_id }))

  const regionLabelById = new Map((regions ?? []).map(r => [r.id, `${r.name} (${r.region_code})`]))
  const storeById = new Map((stores ?? []).map(s => [s.id, s]))
  const rmRegions = new Map<string, string[]>()
  for (const r of (ru ?? [])) { const a = rmRegions.get(r.user_id) ?? []; const l = regionLabelById.get(r.region_id); if (l) a.push(l); rmRegions.set(r.user_id, a) }
  const smBranch = new Map<string, string>()
  for (const s of (su ?? [])) { const store = storeById.get(s.store_id); if (store?.branch_code && !smBranch.has(s.user_id)) smBranch.set(s.user_id, store.branch_code) }

  const signIns = await loadLastSignIns(db)
  const locationFor = (role: Role, uid: string): string => {
    if (role === 'regional_manager') return (rmRegions.get(uid) ?? []).join(', ') || '—'
    if (role === 'store_manager') return smBranch.get(uid) ?? '—'
    return '—'
  }

  const supplierUserIds = new Map<string, string[]>()
  for (const s of (supUsers ?? [])) { const a = supplierUserIds.get(s.supplier_id) ?? []; a.push(s.user_id); supplierUserIds.set(s.supplier_id, a) }
  const supplierActive = (sid: string) => (supplierUserIds.get(sid) ?? []).some(uid => !!signIns.get(uid))

  const members: MemberRow[] = (users ?? []).map(u => ({
    id: u.id, name: u.full_name ?? '', email: u.email ?? '—', role: u.role as Role,
    location: locationFor(u.role as Role, u.id), lastSignIn: signIns.get(u.id) ?? null,
  }))
  const supplierRows: SupplierRow[] = (suppliers ?? []).map(s => ({
    id: s.id, name: s.company_name, verified: s.verification_status === 'verified',
    isMotiv: s.source === 'self_signup' || s.source === 'motiv_invite' || s.is_motiv === true, pending: !supplierActive(s.id),
  })).sort((a, b) => a.name.localeCompare(b.name))

  const group: CompanyGroup = { id: company.id, name: company.name, logoUrl: company.logo_url ?? null, members, suppliers: supplierRows }

  return (
    <div className="space-y-5">
      <BackLink fallbackHref="/admin/accounts" label="Back to accounts" />
      <div className="flex items-center gap-3">
        <CompanyAvatar name={company.name} logoUrl={company.logo_url ?? null} size={48} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text)] truncate">{company.name}</h1>
          <p className="text-sm text-[var(--text-muted)]">
            <span className={company.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}>{company.active ? 'Active' : 'Inactive'}</span> · Created {formatDate(company.created_at)}
          </p>
        </div>
      </div>

      <CompanyAccountsCard group={group} regions={regionOpts} projects={projectOpts} defaultOpen />
    </div>
  )
}
