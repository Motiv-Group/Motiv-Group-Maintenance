export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireRegionalUser } from '@/lib/health/guard'
import { loadProjectStore } from '@/lib/projects/data'
import { RegionalStoreDetail } from '@/components/projects/regional/RegionalStoreDetail'

export default async function RegionalStorePage({ params }: { params: Promise<{ id: string; storeId: string }> }) {
  const { id, storeId } = await params
  const { companyId } = await requireRegionalUser()
  if (!companyId) notFound()
  const loaded = await loadProjectStore(companyId, storeId)
  if (!loaded || loaded.store.project_id !== id) notFound()
  return <RegionalStoreDetail projectId={id} store={loaded.store} project={loaded.project} files={loaded.files} />
}
