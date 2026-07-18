import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { projectAdminAuth, loadOwnedProject, loadOwnedStore } from '@/lib/projects/guard'
import { logProjectEvent } from '@/lib/projects/data'
import type { FileCategory } from '@/lib/projects/types'

export const dynamic = 'force-dynamic'

const CATEGORIES: FileCategory[] = ['before_photo', 'after_photo', 'signoff_photo', 'signoff_document', 'project_cover']

interface Item {
  url: string
  original_filename?: string
  mime_type?: string
  file_size?: number
  caption?: string
  signed_date?: string
  signatory_name?: string
}

// POST /api/projects/[id]/files — record uploaded files (already in the project-files
// bucket via /api/uploads). Body: { project_store_id?, category, items[] }.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await projectAdminAuth()
  if ('fail' in auth) return NextResponse.json({ error: auth.message }, { status: auth.fail })
  const { userId, companyId, admin } = auth

  if (!(await rateLimit(`projects:${userId}`, 120, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const project = await loadOwnedProject(admin, companyId, id)
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const category = body?.category as FileCategory
  if (!CATEGORIES.includes(category)) return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  const items: Item[] = Array.isArray(body?.items) ? body.items.filter((i: Item) => i && typeof i.url === 'string') : []
  if (!items.length) return NextResponse.json({ error: 'No files' }, { status: 400 })

  const storeId: string | null = body.project_store_id ?? null
  if (storeId) {
    const store = await loadOwnedStore(admin, companyId, storeId)
    if (!store || store.project_id !== id) return NextResponse.json({ error: 'Store not found' }, { status: 404 })
  } else if (category !== 'project_cover') {
    return NextResponse.json({ error: 'A store is required for this file category' }, { status: 400 })
  }

  // Continue sort_order after the current max for this store+category.
  const { data: existing } = await admin
    .from('project_files')
    .select('sort_order')
    .eq('project_id', id)
    .eq('file_category', category)
    .eq('project_store_id', storeId as string)
    .order('sort_order', { ascending: false })
    .limit(1)
  let next = (existing?.[0]?.sort_order ?? -1) + 1

  const rows = items.map((it) => ({
    project_id: id,
    company_id: companyId,
    project_store_id: storeId,
    file_category: category,
    storage_path: it.url,
    original_filename: it.original_filename ?? null,
    mime_type: it.mime_type ?? null,
    file_size: typeof it.file_size === 'number' ? it.file_size : null,
    caption: it.caption ? String(it.caption) : null,
    signed_date: it.signed_date || null,
    signatory_name: it.signatory_name ? String(it.signatory_name) : null,
    sort_order: next++,
    uploaded_by: userId,
  }))

  const { data: inserted, error } = await admin.from('project_files').insert(rows).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Project cover → also set the project's cover_image_path.
  if (category === 'project_cover' && items[0]?.url) {
    await admin.from('projects').update({ cover_image_path: items[0].url, updated_at: new Date().toISOString() }).eq('id', id)
  }

  await logProjectEvent(admin, {
    projectId: id,
    companyId,
    projectStoreId: storeId,
    eventType: `file.${category}.uploaded`,
    newValue: String(items.length),
    createdBy: userId,
  })

  revalidatePath(`/admin/projects/${id}`)
  if (storeId) revalidatePath(`/admin/projects/${id}/stores/${storeId}`)
  return NextResponse.json({ ids: (inserted ?? []).map(r => r.id) })
}

// PATCH /api/projects/[id]/files — reorder: { orders: [{ id, sort_order }] }.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await projectAdminAuth()
  if ('fail' in auth) return NextResponse.json({ error: auth.message }, { status: auth.fail })
  const { userId, companyId, admin } = auth

  if (!(await rateLimit(`projects:${userId}`, 120, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await req.json().catch(() => null)
  const orders = Array.isArray(body?.orders) ? body.orders : []
  if (!orders.length) return NextResponse.json({ error: 'No orders' }, { status: 400 })

  for (const o of orders) {
    if (!o?.id || typeof o.sort_order !== 'number') continue
    await admin.from('project_files').update({ sort_order: o.sort_order }).eq('id', o.id).eq('project_id', id).eq('company_id', companyId)
  }
  revalidatePath(`/admin/projects/${id}`)
  return NextResponse.json({ ok: true })
}
