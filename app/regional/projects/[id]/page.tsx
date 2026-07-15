export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireRegionalUser } from '@/lib/health/guard'
import { loadProject } from '@/lib/projects/data'
import { RegionalProjectDashboard } from '@/components/projects/regional/RegionalProjectDashboard'

export default async function RegionalProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { companyId } = await requireRegionalUser()
  if (!companyId) notFound()
  const loaded = await loadProject(companyId, id)
  if (!loaded) notFound()
  return <RegionalProjectDashboard project={loaded.project} summary={loaded.summary} stores={loaded.stores} />
}
