import 'server-only'
import { createClient, createAdminClient } from '@/lib/supabase/server'

type Admin = ReturnType<typeof createAdminClient>

export type ProjectAdminAuth =
  | { fail: number; message: string }
  | { userId: string; companyId: string; admin: Admin }

/**
 * Gate a project WRITE route to the system_admin who owns the tenant. All project
 * mutations run via the service-role client (which bypasses RLS) so this route-level
 * check is the real authorisation — projects are scoped to the admin's own company_id.
 */
export async function projectAdminAuth(): Promise<ProjectAdminAuth> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { fail: 401, message: 'Unauthorised' }
  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  if (!prof || prof.role !== 'system_admin') return { fail: 403, message: 'Forbidden' }
  if (!prof.company_id) return { fail: 403, message: 'Your admin account is not linked to a company.' }
  return { userId: user.id, companyId: prof.company_id, admin }
}

/** Load a project owned by the company, or null (→ 404). */
export async function loadOwnedProject(admin: Admin, companyId: string, projectId: string) {
  const { data } = await admin.from('projects').select('*').eq('id', projectId).eq('company_id', companyId).single()
  return data
}

/** Load a store owned by the company, or null (→ 404). */
export async function loadOwnedStore(admin: Admin, companyId: string, storeId: string) {
  const { data } = await admin.from('project_stores').select('*').eq('id', storeId).eq('company_id', companyId).single()
  return data
}
