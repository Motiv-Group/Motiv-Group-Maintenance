import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export interface ExecContext { userId: string; companyId: string; fullName: string | null }

export interface SupplierContext { userId: string; companyId: string; supplierIds: string[]; fullName: string | null }

/** Gate a v3 supplier page + return their supplier scope. */
export async function requireSupplierV3(): Promise<SupplierContext> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('user_profiles').select('role, company_id, full_name').eq('id', user.id).single()
  if (profile?.role !== 'supplier') redirect('/auth/login')
  if (!profile?.company_id) redirect('/auth/login')
  const { data: links } = await supabase.from('supplier_users').select('supplier_id').eq('user_id', user.id)
  return { userId: user.id, companyId: profile.company_id, supplierIds: (links ?? []).map(l => l.supplier_id), fullName: profile.full_name ?? null }
}

export interface StoreContext { userId: string; companyId: string; storeIds: string[]; fullName: string | null }

/** Gate a v3 store-manager page + return their store scope. */
export async function requireStoreManagerV3(): Promise<StoreContext> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('user_profiles').select('role, company_id, full_name').eq('id', user.id).single()
  if (profile?.role !== 'store_manager') redirect('/auth/login')
  if (!profile?.company_id) redirect('/auth/login')
  const { data: links } = await supabase.from('store_users').select('store_id').eq('user_id', user.id)
  return { userId: user.id, companyId: profile.company_id, storeIds: (links ?? []).map(l => l.store_id), fullName: profile.full_name ?? null }
}

export interface RegionalContext { userId: string; companyId: string; regionIds: string[]; fullName: string | null }

/** Gate a v3 regional-manager DATA page + return their region scope. A signed-up
 *  but not-yet-approved RM (no company) is sent to the /regional landing, which
 *  shows a "pending region assignment" screen — never back to /auth/login (that
 *  would loop with the middleware). */
export async function requireRegionalV3(): Promise<RegionalContext> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('user_profiles').select('role, company_id, full_name').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') redirect('/auth/login')
  if (!profile?.company_id) redirect('/regional')
  const { data: links } = await supabase.from('regional_users').select('region_id').eq('user_id', user.id)
  if (!links?.length) redirect('/regional')
  return { userId: user.id, companyId: profile.company_id, regionIds: links.map(l => l.region_id), fullName: profile.full_name ?? null }
}

export interface RegionalUser {
  userId: string; role: string; companyId: string | null; regionIds: string[]
  fullName: string | null; requestedRegionCode: string | null
}

/** Tolerant gate for the regional LAYOUT + landing: requires an RM login but
 *  allows a pending (un-approved, no-company) RM through so they can see the
 *  pending screen and reach Settings. Does not redirect on missing company. */
export async function requireRegionalUser(): Promise<RegionalUser> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase
    .from('user_profiles').select('role, company_id, full_name, requested_region_code').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') redirect('/auth/login')
  const { data: links } = await supabase.from('regional_users').select('region_id').eq('user_id', user.id)
  return {
    userId: user.id, role: profile.role, companyId: profile.company_id ?? null,
    regionIds: (links ?? []).map(l => l.region_id), fullName: profile.full_name ?? null,
    requestedRegionCode: profile.requested_region_code ?? null,
  }
}

export interface MasterAdminContext { userId: string; email: string }

// Optional email allowlist layered on top of the system_admin role. If
// NEXT_PUBLIC_ADMIN_EMAILS is set, the signed-in account's email must also be
// in it to reach the infra/ops area — so a stray system_admin can't see
// provider secrets/analytics. Left empty (unset) → role check alone applies.
const MASTER_ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

/** Gate the platform-admin (infra/ops) area to the master admin only.
 *  "Master admin" = the `system_admin` role — the app owner. Middleware already
 *  restricts /admin/* to that role and login redirects them here; this is the
 *  page-level defence-in-depth check, plus the optional email allowlist above. */
export async function requireMasterAdmin(): Promise<MasterAdminContext> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'system_admin') redirect('/auth/login')
  const email = (user.email ?? '').toLowerCase()
  if (MASTER_ADMIN_EMAILS.length && !MASTER_ADMIN_EMAILS.includes(email)) redirect('/auth/login')
  return { userId: user.id, email: user.email ?? '' }
}

/** Gate a v3 executive page + return their company scope. */
export async function requireExecutiveV3(): Promise<ExecContext> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase
    .from('user_profiles').select('role, company_id, full_name').eq('id', user.id).single()
  if (profile?.role !== 'executive' && profile?.role !== 'system_admin') redirect('/auth/login')
  if (!profile?.company_id) redirect('/auth/login')
  return { userId: user.id, companyId: profile.company_id, fullName: profile.full_name ?? null }
}
