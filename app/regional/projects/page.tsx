export const dynamic = 'force-dynamic'

import { requireRegionalUser } from '@/lib/health/guard'
import { loadProjects, loadProject } from '@/lib/projects/data'
import { RegionalProjectsClient } from '@/components/projects/regional/RegionalProjectsClient'

export default async function RegionalProjectsPage() {
  const { companyId } = await requireRegionalUser()
  const projects = companyId ? await loadProjects(companyId, false) : []
  // Featured = first Active project, else the most recent — drives the hero + the
  // milestone / timeline cards (which need the project's stores).
  const featuredSummary = projects.find((p) => p.status === 'active') ?? projects[0] ?? null
  const detail = companyId && featuredSummary ? await loadProject(companyId, featuredSummary.id) : null

  return (
    <RegionalProjectsClient
      projects={projects}
      featured={detail ? { summary: detail.summary, project: detail.project, stores: detail.stores } : null}
    />
  )
}
