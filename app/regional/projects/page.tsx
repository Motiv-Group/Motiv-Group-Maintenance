export const dynamic = 'force-dynamic'

import { requireRegionalUser } from '@/lib/health/guard'
import { loadProjects } from '@/lib/projects/data'
import { RegionalProjectsClient } from '@/components/projects/regional/RegionalProjectsClient'

export default async function RegionalProjectsPage() {
  const { companyId } = await requireRegionalUser()
  const projects = companyId ? await loadProjects(companyId, false) : []
  return <RegionalProjectsClient projects={projects} />
}
