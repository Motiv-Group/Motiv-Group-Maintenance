export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { Network } from 'lucide-react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { BackLink } from '@/components/ui/BackLink'
import { CompanyAvatar } from '@/components/admin/CompanyAvatar'
import { InfoTip } from '@/components/ui/InfoTip'
import { HierarchyLinker, type LinkerExec, type LinkerRM, type LinkerSM, type LinkerStoreRow } from '@/components/admin/HierarchyLinker'
import { storeLabel } from '@/lib/utils'

export default async function AdminHierarchyCompanyPage(props: { params: Promise<{ id: string }> }) {
  await requireMasterAdmin()
  const { id } = await props.params
  const db = createAdminClient()

  const { data: company } = await db.from('companies').select('id, name, logo_url').eq('id', id).single()
  if (!company) notFound()

  const [{ data: users }, { data: regions }, { data: stores }, { data: ru }, { data: su }, { data: rex }] = await Promise.all([
    db.from('user_profiles').select('id, full_name, email, role').eq('company_id', id).in('role', ['executive', 'regional_manager', 'store_manager']),
    db.from('regions').select('id, name, region_code').eq('company_id', id).eq('active', true).order('name'),
    db.from('stores').select('id, name, sub_store, branch_code, region_id').eq('company_id', id).eq('active', true).order('branch_code'),
    db.from('regional_users').select('user_id, region_id'),
    db.from('store_users').select('user_id, store_id'),
    db.from('rm_executive_links').select('rm_user_id, executive_user_id').eq('company_id', id),
  ])

  const regionOpts = (regions ?? []).map(r => ({ id: r.id, label: `${r.name} (${r.region_code})` }))
  // SM chips carry the store's region code so the SM→store→region→RM chain is visible at a glance.
  const regionCodeById = new Map((regions ?? []).map(r => [r.id, r.region_code]))
  const baseStoreLabel = (s: { name: string | null; sub_store: string | null; branch_code: string | null }) =>
    `${s.branch_code ? s.branch_code + ' · ' : ''}${storeLabel(s.name, s.sub_store)}`
  const storeOpts = (stores ?? []).map(s => {
    const code = s.region_id ? regionCodeById.get(s.region_id) : null
    return { id: s.id, label: `${baseStoreLabel(s)}${code ? ` · ${code}` : ''}` }
  })
  // Stores card: each store's current region + the move-to-region control.
  const storeRows: LinkerStoreRow[] = (stores ?? []).map(s => ({ id: s.id, label: baseStoreLabel(s), regionId: s.region_id ?? null }))

  const rmRegions = new Map<string, string[]>()
  for (const r of (ru ?? [])) { const a = rmRegions.get(r.user_id) ?? []; a.push(r.region_id); rmRegions.set(r.user_id, a) }
  const smStores = new Map<string, string[]>()
  for (const s of (su ?? [])) { const a = smStores.get(s.user_id) ?? []; a.push(s.store_id); smStores.set(s.user_id, a) }
  const rmExecs = new Map<string, string[]>()
  for (const r of (rex ?? [])) { const a = rmExecs.get(r.rm_user_id) ?? []; a.push(r.executive_user_id); rmExecs.set(r.rm_user_id, a) }

  const companyRegionIds = new Set((regions ?? []).map(r => r.id))
  const companyStoreIds = new Set((stores ?? []).map(s => s.id))

  const executives: LinkerExec[] = (users ?? []).filter(u => u.role === 'executive').map(u => ({ id: u.id, name: u.full_name ?? '—' }))
  const rms: LinkerRM[] = (users ?? []).filter(u => u.role === 'regional_manager').map(u => ({
    id: u.id, name: u.full_name ?? '', email: u.email ?? '—',
    regionIds: (rmRegions.get(u.id) ?? []).filter(rid => companyRegionIds.has(rid)),
    execIds: rmExecs.get(u.id) ?? [],
  }))
  const sms: LinkerSM[] = (users ?? []).filter(u => u.role === 'store_manager').map(u => ({
    id: u.id, name: u.full_name ?? '', email: u.email ?? '—',
    storeIds: (smStores.get(u.id) ?? []).filter(sid => companyStoreIds.has(sid)),
  }))

  return (
    <div className="space-y-5">
      <BackLink fallbackHref="/admin/hierarchy" label="Back to hierarchy" />
      <div className="flex items-center gap-3">
        <CompanyAvatar name={company.name} logoUrl={company.logo_url ?? null} size={48} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text)] truncate flex items-center gap-2">
            {company.name}
            <InfoTip title="Linking" align="left">Assign each Regional Manager their regions and executive(s), and each Store Manager their stores. An RM can cover several regions; an SM several stores. Changes save immediately.</InfoTip>
          </h1>
          <p className="text-sm text-[var(--text-muted)] flex items-center gap-1.5"><Network size={13} /> Link managers to regions, stores and executives</p>
        </div>
      </div>

      <HierarchyLinker companyId={company.id} executives={executives} regions={regionOpts} stores={storeOpts} storeRows={storeRows} rms={rms} sms={sms} />
    </div>
  )
}
