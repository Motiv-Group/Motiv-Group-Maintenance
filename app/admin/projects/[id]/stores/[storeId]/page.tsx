export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { loadProjectStore } from '@/lib/projects/data'
import { AdminStoreEditor } from '@/components/projects/admin/AdminStoreEditor'

export default async function AdminStorePage({ params }: { params: Promise<{ id: string; storeId: string }> }) {
  const { id, storeId } = await params
  const { userId } = await requireMasterAdmin()
  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('company_id').eq('id', userId).single()
  const companyId = (prof as any)?.company_id ?? null
  if (!companyId) notFound()

  const loaded = await loadProjectStore(companyId, storeId)
  if (!loaded || loaded.store.project_id !== id) notFound()

  // Ordered store ids for prev/next navigation.
  const { data: siblings } = await admin
    .from('project_stores')
    .select('id, branch_code')
    .eq('project_id', id)
    .order('branch_code', { ascending: true })
  const ids = (siblings ?? []).map((s: any) => s.id)
  const idx = ids.indexOf(storeId)

  return (
    <AdminStoreEditor
      projectId={id}
      store={loaded.store}
      project={loaded.project}
      files={loaded.files}
      prevId={idx > 0 ? ids[idx - 1] : null}
      nextId={idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null}
      position={idx + 1}
      total={ids.length}
    />
  )
}
