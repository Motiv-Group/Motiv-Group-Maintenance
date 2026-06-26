import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * Resolve the calling supplier's context for API routes: their company and the
 * list of suppliers.id they belong to. Returns null if the caller isn't a
 * supplier or isn't linked to any supplier company.
 */
export async function supplierCtx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  if (prof?.role !== 'supplier' || !prof.company_id) return null
  const { data: links } = await admin.from('supplier_users').select('supplier_id').eq('user_id', user.id)
  const supplierIds = (links ?? []).map(l => l.supplier_id)
  if (!supplierIds.length) return null
  return { userId: user.id, companyId: prof.company_id as string, supplierIds, admin }
}
