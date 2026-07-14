import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/server'
import { projectAdminAuth } from '@/lib/projects/guard'
import { logProjectEvent, fileCategoryCounts } from '@/lib/projects/data'
import { bucketAndPath } from '@/lib/storage'
import { CATEGORY_MILESTONE, MILESTONE_COLUMN, type FileCategory } from '@/lib/projects/types'

export const dynamic = 'force-dynamic'

// DELETE /api/projects/[id]/files/[fileId] — remove a file. If it was the last piece
// of evidence for its milestone, auto-clear that milestone (recomputes the % — spec
// acceptance 10). Best-effort deletes the storage object too.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params
  const auth = await projectAdminAuth()
  if ('fail' in auth) return NextResponse.json({ error: auth.message }, { status: auth.fail })
  const { userId, companyId, admin } = auth

  if (!(await rateLimit(`projects:${userId}`, 120, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { data: file } = await admin
    .from('project_files')
    .select('id, project_id, project_store_id, file_category, storage_path')
    .eq('id', fileId)
    .eq('company_id', companyId)
    .single()
  if (!file || (file as any).project_id !== id) return NextResponse.json({ error: 'File not found' }, { status: 404 })
  const f = file as any

  const { error } = await admin.from('project_files').delete().eq('id', fileId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort remove the storage object.
  const bp = bucketAndPath(f.storage_path)
  if (bp) {
    try {
      await createAdminClient().storage.from(bp.bucket).remove([bp.path])
    } catch {
      /* ignore — the DB row is already gone */
    }
  }

  // If this emptied the milestone's evidence, clear the milestone so the % drops.
  const milestone = CATEGORY_MILESTONE[f.file_category as FileCategory]
  if (milestone && f.project_store_id) {
    const counts = await fileCategoryCounts(admin, f.project_store_id)
    const stillHasEvidence =
      milestone === 'signoff' ? (counts.signoff_photo ?? 0) + (counts.signoff_document ?? 0) > 0 : (counts[f.file_category] ?? 0) > 0
    if (!stillHasEvidence) {
      await admin
        .from('project_stores')
        .update({ [MILESTONE_COLUMN[milestone]]: null, updated_at: new Date().toISOString() } as never)
        .eq('id', f.project_store_id)
      await logProjectEvent(admin, {
        projectId: id,
        companyId,
        projectStoreId: f.project_store_id,
        eventType: `milestone.${milestone}.reversed`,
        newValue: 'outstanding (evidence removed)',
        createdBy: userId,
      })
    }
  }

  await logProjectEvent(admin, {
    projectId: id,
    companyId,
    projectStoreId: f.project_store_id,
    eventType: `file.${f.file_category}.deleted`,
    createdBy: userId,
  })

  revalidatePath(`/admin/projects/${id}`)
  if (f.project_store_id) revalidatePath(`/admin/projects/${id}/stores/${f.project_store_id}`)
  return NextResponse.json({ ok: true })
}
