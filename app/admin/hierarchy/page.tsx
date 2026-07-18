export const dynamic = 'force-dynamic'

import { Network } from 'lucide-react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { InfoTip } from '@/components/ui/InfoTip'
import { HierarchyView, type CompanyNode, type RegionRef } from '@/components/admin/HierarchyView'
import { AdminSelfCompany } from '@/components/admin/AdminSelfCompany'

export default async function AdminHierarchyPage() {
  const { userId } = await requireMasterAdmin()
  const db = createAdminClient()
  const { data: mine } = await db.from('user_profiles').select('company_id').eq('id', userId).single()
  const myCompanyId = mine?.company_id ?? null
  const [{ data: companies }, { data: regions }, { data: stores }, { data: users }, { data: ru }, { data: su }] = await Promise.all([
    db.from('companies').select('id, name').eq('active', true).order('name'),
    db.from('regions').select('id, name, region_code, company_id').eq('active', true).order('name'),
    db.from('stores').select('id, name, sub_store, branch_code, company_id, region_id').eq('active', true).order('name'),
    db.from('user_profiles').select('id, full_name, email, role, company_id').in('role', ['executive', 'regional_manager', 'store_manager']).eq('active', true),
    db.from('regional_users').select('user_id, region_id'),
    db.from('store_users').select('user_id, store_id'),
  ])
  type UserRow = NonNullable<typeof users>[number]
  type StoreRow = NonNullable<typeof stores>[number]
  type RegionRow = NonNullable<typeof regions>[number]
  const prof = new Map((users ?? []).map(u => [u.id, u]))
  const rmByRegion = new Map<string, UserRow[]>()
  for (const r of (ru ?? [])) { const p = prof.get(r.user_id); if (p?.role === 'regional_manager') { const a = rmByRegion.get(r.region_id) ?? []; a.push(p); rmByRegion.set(r.region_id, a) } }
  const smByStore = new Map<string, UserRow>()
  for (const s of (su ?? [])) { const p = prof.get(s.user_id); if (p?.role === 'store_manager' && !smByStore.has(s.store_id)) smByStore.set(s.store_id, p) }
  const storesByRegion = new Map<string, StoreRow[]>()
  const unassignedByCompany = new Map<string, StoreRow[]>()
  for (const s of (stores ?? [])) {
    if (!s.region_id) { const a = unassignedByCompany.get(s.company_id) ?? []; a.push(s); unassignedByCompany.set(s.company_id, a); continue }
    const a = storesByRegion.get(s.region_id) ?? []; a.push(s); storesByRegion.set(s.region_id, a)
  }
  const storeNode = (s: StoreRow) => {
    const sm = smByStore.get(s.id)
    return { id: s.id, name: s.name, subStore: s.sub_store ?? null, branchCode: s.branch_code ?? null, sm: sm ? { name: sm.full_name ?? '—', email: sm.email ?? '' } : null }
  }
  const regionsByCompany = new Map<string, RegionRow[]>()
  for (const r of (regions ?? [])) { const a = regionsByCompany.get(r.company_id) ?? []; a.push(r); regionsByCompany.set(r.company_id, a) }

  const tree: CompanyNode[] = (companies ?? []).map(c => ({
    id: c.id, name: c.name,
    execs: (users ?? []).filter(u => u.role === 'executive' && u.company_id === c.id).map(u => ({ id: u.id, name: u.full_name ?? '—', email: u.email ?? '' })),
    regions: (regionsByCompany.get(c.id) ?? []).map(r => ({
      id: r.id, name: r.name, code: r.region_code,
      rms: (rmByRegion.get(r.id) ?? []).map(u => ({ id: u.id, name: u.full_name ?? '—', email: u.email ?? '' })),
      stores: (storesByRegion.get(r.id) ?? []).map(storeNode),
    })),
    unassignedStores: (unassignedByCompany.get(c.id) ?? []).map(storeNode),
  }))
  const regionRefs: Record<string, RegionRef[]> = {}
  for (const [cid, rs] of regionsByCompany.entries()) regionRefs[cid] = rs.map(r => ({ id: r.id, name: r.name, code: r.region_code }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <Network className="text-blue-600 dark:text-blue-400" size={22} /> Hierarchy
          <InfoTip title="Hierarchy" align="left">Company → Executives, Regions → Regional Managers and Stores → Store Managers. Move a store to another region (re-links its SM under that region&apos;s RM), or reassign an RM to a region.</InfoTip>
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Which store belongs to which company, and who manages what. Move stores or reassign managers to re-link the tree.</p>
      </div>
      <AdminSelfCompany
        currentCompanyId={myCompanyId}
        currentCompanyName={(companies ?? []).find(c => c.id === myCompanyId)?.name ?? null}
        companies={(companies ?? []).map(c => ({ id: c.id, name: c.name }))}
      />
      <HierarchyView companies={tree} regionsByCompany={regionRefs} />
    </div>
  )
}
