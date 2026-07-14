import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { projectAdminAuth, loadOwnedProject } from '@/lib/projects/guard'
import { logProjectEvent } from '@/lib/projects/data'
import { logAudit } from '@/lib/audit'
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
