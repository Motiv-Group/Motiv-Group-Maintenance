export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireRegionalUser } from '@/lib/health/guard'
import { loadProject } from '@/lib/projects/data'
import { RegionalProjectDashboard } from '@/components/projects/regional/RegionalProjectDashboard'

export default async function RegionalProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { companyId, userId } = await requireRegionalUser()
  if (!companyId) notFound()
  // 404 if this RM isn't assigned to the project (per-RM project access).
  const loaded = await loadProject(companyId, id, userId)
  if (!loaded) notFound()
  return <RegionalProjectDashboard project={loaded.project} summary={loaded.summary} stores={loaded.stores} />
}
