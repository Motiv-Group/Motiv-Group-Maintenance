import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { projectAdminAuth, loadOwnedProject } from '@/lib/projects/guard'
import { logProjectEvent } from '@/lib/projects/data'
import { logAudit } from '@/lib/audit'
import { bucketAndPath } from '@/lib/storage'
import { PROJECT_STATUSES } from '@/lib/projects/types'

export const dynamic = 'force-dynamic'

// PATCH /api/projects/[id] — edit project fields / status / archive (system_admin).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await projectAdminAuth()
  if ('fail' in auth) return NextResponse.json({ error: auth.message }, { status: auth.fail })
  const { userId, companyId, admin } = auth

  if (!(await rateLimit(`projects:${userId}`, 60, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const project = await loadOwnedProject(admin, companyId, id)
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if ('description' in body) patch.description = body.description ? String(body.description) : null
  if ('client_name' in body) patch.client_name = body.client_name ? String(body.client_name) : null
  if ('start_date' in body) patch.start_date = body.start_date || null
  if ('end_date' in body) patch.end_date = body.end_date || null
  if ('cover_image_path' in body) patch.cover_image_path = body.cover_image_path || null
  if (typeof body.status === 'string' && PROJECT_STATUSES.includes(body.status)) patch.status = body.status

  // Archive / restore toggles.
  if (body.archive === true) {
    patch.archived_at = new Date().toISOString()
    patch.status = 'archived'
  } else if (body.archive === false) {
    patch.archived_at = null
    if (patch.status === undefined && project.status === 'archived') patch.status = 'active'
  }

  const { error } = await admin.from('projects').update(patch as never).eq('id', id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const eventType = body.archive === true ? 'project.archived' : body.archive === false ? 'project.restored' : 'project.edited'
  await logProjectEvent(admin, { projectId: id, companyId, eventType, createdBy: userId })
  await logAudit(admin, { actorId: userId, companyId, action: eventType, entityType: 'project', entityId: id })

  revalidatePath('/admin/projects')
  revalidatePath(`/admin/projects/${id}`)
  revalidatePath('/regional/projects')
  return NextResponse.json({ ok: true })
}

// DELETE /api/projects/[id] — permanently delete a project + all its stores, files
// and history (FK cascade). Also best-effort removes the uploaded storage objects.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await projectAdminAuth()
  if ('fail' in auth) return NextResponse.json({ error: auth.message }, { status: auth.fail })
  const { userId, companyId, admin } = auth

  if (!(await rateLimit(`projects:${userId}`, 30, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const project = await loadOwnedProject(admin, companyId, id)
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Collect storage paths BEFORE the cascade removes the file rows.
  const { data: files } = await admin.from('project_files').select('storage_path').eq('project_id', id)
  const paths = (files ?? []).map((f) => f.storage_path)

  const { error } = await admin.from('projects').delete().eq('id', id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort storage cleanup (grouped by bucket). The DB rows are already gone.
  const byBucket = new Map<string, string[]>()
  for (const p of paths) {
    const bp = bucketAndPath(p)
    if (bp) {
      const arr = byBucket.get(bp.bucket) ?? []
      arr.push(bp.path)
      byBucket.set(bp.bucket, arr)
    }
  }
  for (const [bucket, ps] of byBucket) {
    try {
      await admin.storage.from(bucket).remove(ps)
    } catch {
      /* ignore — rows already deleted */
    }
  }

  await logAudit(admin, { actorId: userId, companyId, action: 'project.deleted', entityType: 'project', entityId: id, metadata: { name: project.name, files: paths.length } })

  revalidatePath('/admin/projects')
  revalidatePath('/regional/projects')
  return NextResponse.json({ ok: true })
}
