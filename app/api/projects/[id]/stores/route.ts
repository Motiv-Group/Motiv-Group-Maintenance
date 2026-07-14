import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { projectAdminAuth, loadOwnedProject } from '@/lib/projects/guard'
import { logProjectEvent } from '@/lib/projects/data'

export const dynamic = 'force-dynamic'

// POST /api/projects/[id]/stores — add a single store manually (system_admin).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await projectAdminAuth()
  if ('fail' in auth) return NextResponse.json({ error: auth.message }, { status: auth.fail })
  const { userId, companyId, admin } = auth

  if (!(await rateLimit(`projects:${userId}`, 60, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const project = await loadOwnedProject(admin, companyId, id)
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const branch = body?.branch_code ? String(body.branch_code).trim() : ''
  if (!branch) return NextResponse.json({ error: 'Branch code is required' }, { status: 400 })

  // Enforce the per-project unique branch code with a clear message (not a raw 23505).
  const { data: existing } = await admin.from('project_stores').select('id').eq('project_id', id).ilike('branch_code', branch).limit(1)
  if (existing && existing.length) return NextResponse.json({ error: `Branch code "${branch}" already exists on this project` }, { status: 409 })

  const { data: store, error } = await admin
    .from('project_stores')
    .insert({
      project_id: id,
      company_id: companyId,
      branch_code: branch,
      store_name: body.store_name ? String(body.store_name) : null,
      town: body.town ? String(body.town) : null,
      rfid_m2_required: body.rfid_m2_required === '' || body.rfid_m2_required == null ? null : Number(body.rfid_m2_required),
      start_date: body.start_date || null,
      end_date: body.end_date || null,
    })
    .select('id')
    .single()
  if (error || !store) return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 })

  await logProjectEvent(admin, { projectId: id, companyId, projectStoreId: store.id, eventType: 'store.created', newValue: branch, createdBy: userId })
  revalidatePath(`/admin/projects/${id}`)
  return NextResponse.json({ id: store.id })
}
