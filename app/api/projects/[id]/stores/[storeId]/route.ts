import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { projectAdminAuth, loadOwnedStore } from '@/lib/projects/guard'
import { logProjectEvent, fileCategoryCounts } from '@/lib/projects/data'
import { MILESTONE_COLUMN, type MilestoneKey } from '@/lib/projects/types'

export const dynamic = 'force-dynamic'

const MILESTONE_EVIDENCE: Record<MilestoneKey, string[]> = {
  on_site: [], // manual — no file required
  before_photos: ['before_photo'],
  after_photos: ['after_photo'],
  signoff: ['signoff_photo', 'signoff_document'],
}

// POST /api/projects/[id]/stores/[storeId] — { action }.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; storeId: string }> }) {
  const { id, storeId } = await params
  const auth = await projectAdminAuth()
  if ('fail' in auth) return NextResponse.json({ error: auth.message }, { status: auth.fail })
  const { userId, companyId, admin } = auth

  if (!(await rateLimit(`projects:${userId}`, 120, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const store = await loadOwnedStore(admin, companyId, storeId)
  if (!store || store.project_id !== id) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body?.action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

  const now = new Date().toISOString()

  // ── Mark / unmark a milestone ──────────────────────────────────────────────
  if (body.action === 'milestone') {
    const milestone = body.milestone as MilestoneKey
    if (!(milestone in MILESTONE_COLUMN)) return NextResponse.json({ error: 'Unknown milestone' }, { status: 400 })
    const complete = body.complete !== false
    const col = MILESTONE_COLUMN[milestone]

    if (complete) {
      const required = MILESTONE_EVIDENCE[milestone]
      if (required.length) {
        const counts = await fileCategoryCounts(admin, storeId)
        const have = required.some((c) => (counts[c] ?? 0) > 0)
        if (!have) return NextResponse.json({ error: 'Upload evidence before marking this milestone complete.' }, { status: 400 })
      }
    }

    const { error } = await admin
      .from('project_stores')
      .update({ [col]: complete ? now : null, updated_at: now } as never)
      .eq('id', storeId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logProjectEvent(admin, {
      projectId: id,
      companyId,
      projectStoreId: storeId,
      eventType: complete ? `milestone.${milestone}.marked` : `milestone.${milestone}.reversed`,
      previousValue: store[col] ? 'complete' : 'outstanding',
      newValue: complete ? 'complete' : 'outstanding',
      createdBy: userId,
    })
    return finish(id, storeId)
  }

  // ── Edit store detail fields ───────────────────────────────────────────────
  if (body.action === 'update') {
    const patch: Record<string, unknown> = { updated_at: now }
    for (const f of ['store_name', 'town', 'on_site_note'] as const) if (f in body) patch[f] = body[f] ? String(body[f]) : null
    if ('rfid_m2_required' in body) patch.rfid_m2_required = body.rfid_m2_required === '' || body.rfid_m2_required == null ? null : Number(body.rfid_m2_required)
    if ('start_date' in body) patch.start_date = body.start_date || null
    if ('end_date' in body) patch.end_date = body.end_date || null
    const { error } = await admin.from('project_stores').update(patch as never).eq('id', storeId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logProjectEvent(admin, { projectId: id, companyId, projectStoreId: storeId, eventType: 'store.details_changed', createdBy: userId })
    return finish(id, storeId)
  }

  // ── Add an internal admin note (never shown to RM) ─────────────────────────
  if (body.action === 'note') {
    if (!body.body || !String(body.body).trim()) return NextResponse.json({ error: 'Note is empty' }, { status: 400 })
    const { error } = await admin.from('project_notes').insert({
      project_id: id,
      company_id: companyId,
      project_store_id: storeId,
      body: String(body.body).trim(),
      created_by: userId,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return finish(id, storeId)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// DELETE /api/projects/[id]/stores/[storeId] — remove a store (cascades files/events).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; storeId: string }> }) {
  const { id, storeId } = await params
  const auth = await projectAdminAuth()
  if ('fail' in auth) return NextResponse.json({ error: auth.message }, { status: auth.fail })
  const { userId, companyId, admin } = auth

  const store = await loadOwnedStore(admin, companyId, storeId)
  if (!store || store.project_id !== id) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  const { error } = await admin.from('project_stores').delete().eq('id', storeId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logProjectEvent(admin, { projectId: id, companyId, eventType: 'store.deleted', previousValue: store.branch_code, createdBy: userId })
  revalidatePath(`/admin/projects/${id}`)
  return NextResponse.json({ ok: true })
}

function finish(projectId: string, storeId: string) {
  revalidatePath(`/admin/projects/${projectId}`)
  revalidatePath(`/admin/projects/${projectId}/stores/${storeId}`)
  revalidatePath('/admin/projects')
  revalidatePath('/regional/projects')
  return NextResponse.json({ ok: true })
}
