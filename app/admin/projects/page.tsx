export const dynamic = 'force-dynamic'

import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { loadProjects } from '@/lib/projects/data'
import { AdminProjectsClient } from '@/components/projects/admin/AdminProjectsClient'

export default async function AdminProjectsPage() {
  const { userId } = await requireMasterAdmin()
  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('company_id').eq('id', userId).single()
  const companyId = prof?.company_id ?? null
  const projects = companyId ? await loadProjects(companyId, true) : []
  return <AdminProjectsClient projects={projects} hasCompany={!!companyId} />
}
