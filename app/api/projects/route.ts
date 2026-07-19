import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { projectAdminAuth } from '@/lib/projects/guard'
import { logProjectEvent } from '@/lib/projects/data'
import { logAudit } from '@/lib/audit'
import { PROJECT_STATUSES, type ProjectStatus } from '@/lib/projects/types'

export const dynamic = 'force-dynamic'

// POST /api/projects — create a project (system_admin only).
export async function POST(req: Request) {
  const auth = await projectAdminAuth()
  if ('fail' in auth) return NextResponse.json({ error: auth.message }, { status: auth.fail })
  const { userId, companyId: linkedCompanyId, admin } = auth

  if (!(await rateLimit(`projects:${userId}`, 30, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body.name !== 'string' || !body.name.trim())
    return NextResponse.json({ error: 'Project name is required' }, { status: 400 })

  // system_admin may create a project for an explicitly-chosen company (the
  // Projects tab company selector); otherwise fall back to their linked company.
  let companyId = linkedCompanyId
  if (typeof body.companyId === 'string' && body.companyId) {
    const { data: c } = await admin.from('companies').select('id').eq('id', body.companyId).maybeSingle()
    if (!c) return NextResponse.json({ error: 'Company not found' }, { status: 400 })
    companyId = body.companyId
  }
  if (!companyId) return NextResponse.json({ error: 'Pick a company for this project' }, { status: 400 })

  const status: ProjectStatus = PROJECT_STATUSES.includes(body.status) ? body.status : 'draft'

  const { data: project, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      name: String(body.name).trim(),
      description: body.description ? String(body.description) : null,
      client_name: body.client_name ? String(body.client_name) : null,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      status,
      cover_image_path: body.cover_image_path || null,
      created_by: userId,
    })
    .select('id')
    .single()

  if (error || !project) return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 })

  if (body.internal_note && String(body.internal_note).trim()) {
    await admin.from('project_notes').insert({
      project_id: project.id,
      company_id: companyId,
      body: String(body.internal_note).trim(),
      created_by: userId,
    })
  }

  await logProjectEvent(admin, {
    projectId: project.id,
    companyId,
    eventType: 'project.created',
    newValue: String(body.name).trim(),
    createdBy: userId,
  })
  await logAudit(admin, { actorId: userId, companyId, action: 'project.created', entityType: 'project', entityId: project.id, metadata: { name: String(body.name).trim() } })

  revalidatePath('/admin/projects')
  revalidatePath('/regional/projects')
  return NextResponse.json({ id: project.id })
}
