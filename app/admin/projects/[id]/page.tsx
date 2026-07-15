export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { loadProject, loadProjectNotes } from '@/lib/projects/data'
import { AdminProjectDetail } from '@/components/projects/admin/AdminProjectDetail'

export default async function AdminProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId } = await requireMasterAdmin()
  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('company_id').eq('id', userId).single()
  const companyId = (prof as any)?.company_id ?? null
  if (!companyId) notFound()

  const loaded = await loadProject(companyId, id)
  if (!loaded) notFound()
  const notes = await loadProjectNotes(companyId, id)

  return <AdminProjectDetail project={loaded.project} summary={loaded.summary} stores={loaded.stores} notes={notes} />
}
