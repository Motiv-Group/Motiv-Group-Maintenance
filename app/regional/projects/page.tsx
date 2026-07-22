export const dynamic = 'force-dynamic'

import { requireRegionalUser } from '@/lib/health/guard'
import { loadProjects, loadProject } from '@/lib/projects/data'
import { RegionalProjectsClient } from '@/components/projects/regional/RegionalProjectsClient'

export default async function RegionalProjectsPage() {
  const { companyId, userId } = await requireRegionalUser()
  // Scope to the projects this RM is assigned to (per-RM project access).
  const projects = companyId ? await loadProjects(companyId, false, userId) : []
  // Featured = first Active project, else the most recent — drives the hero + the
  // milestone / timeline cards (which need the project's stores).
  const featuredSummary = projects.find((p) => p.status === 'active') ?? projects[0] ?? null
  const detail = companyId && featuredSummary ? await loadProject(companyId, featuredSummary.id, userId) : null

  return (
    <RegionalProjectsClient
      projects={projects}
      featured={detail ? { summary: detail.summary, project: detail.project, stores: detail.stores } : null}
    />
  )
}
