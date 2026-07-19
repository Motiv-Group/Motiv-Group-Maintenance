export const dynamic = 'force-dynamic'

import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { loadProjects } from '@/lib/projects/data'
import { AdminProjectsClient } from '@/components/projects/admin/AdminProjectsClient'
import { ProjectCompanySelector } from '@/components/projects/admin/ProjectCompanySelector'

export default async function AdminProjectsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const { userId } = await requireMasterAdmin()
  const admin = createAdminClient()
  const [{ data: prof }, { data: companies }] = await Promise.all([
    admin.from('user_profiles').select('company_id').eq('id', userId).single(),
    admin.from('companies').select('id, name').eq('active', true).order('name'),
  ])

  // Default to the admin's linked company; the selector switches to any company.
  const { company: q } = await searchParams
  const list = companies ?? []
  const requested = q && list.some(c => c.id === q) ? q : null
  const selectedCompanyId = requested ?? prof?.company_id ?? list[0]?.id ?? null

  const projects = selectedCompanyId ? await loadProjects(selectedCompanyId, true) : []

  return (
    <AdminProjectsClient
      projects={projects}
      hasCompany={!!selectedCompanyId}
      selectedCompanyId={selectedCompanyId}
      selector={<ProjectCompanySelector companies={list} selectedId={selectedCompanyId} />}
    />
  )
}
