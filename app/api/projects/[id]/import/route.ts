import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'
import { rateLimit } from '@/lib/rate-limit'
import { projectAdminAuth, loadOwnedProject } from '@/lib/projects/guard'
import { logProjectEvent } from '@/lib/projects/data'
import { logAudit } from '@/lib/audit'
import { parseImportRows, type RawRow, type ParsedStore } from '@/lib/projects/import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB spreadsheet cap

type Mode = 'preview' | 'add_new' | 'update'

// POST /api/projects/[id]/import — multipart { file, mode }. `preview` parses+validates
// without writing; `add_new` inserts new branch codes; `update` also refreshes the
// programme fields of existing stores (never touches milestones or uploaded files).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await projectAdminAuth()
  if ('fail' in auth) return NextResponse.json({ error: auth.message }, { status: auth.fail })
  const { userId, companyId, admin } = auth

  if (!(await rateLimit(`projects-import:${userId}`, 12, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const project = await loadOwnedProject(admin, companyId, id)
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 })
  const file = form.get('file')
  const mode = (String(form.get('mode') ?? 'preview') as Mode)
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })

  // Parse the first sheet into row objects keyed by header text.
  let rows: RawRow[]
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) return NextResponse.json({ error: 'The spreadsheet has no sheets' }, { status: 400 })
    rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }) as RawRow[]
  } catch (e: any) {
    return NextResponse.json({ error: `Could not read the spreadsheet: ${e?.message ?? 'unknown error'}` }, { status: 400 })
  }

  const preview = parseImportRows(rows)

  // Which of the valid branch codes already exist on this project?
  const { data: existing } = await admin.from('project_stores').select('id, branch_code').eq('project_id', id)
  const existingByCode = new Map<string, string>()
  for (const s of (existing ?? []) as any[]) existingByCode.set(String(s.branch_code).toUpperCase(), s.id)

  const newRows = preview.valid.filter((v) => !existingByCode.has(v.branch_code.toUpperCase()))
  const existingRows = preview.valid.filter((v) => existingByCode.has(v.branch_code.toUpperCase()))

  if (mode === 'preview') {
    return NextResponse.json({
      preview,
      counts: {
        total: preview.totalRows,
        valid: preview.valid.length,
        invalid: preview.invalid.length,
        toCreate: newRows.length,
        toUpdate: existingRows.length,
        existingOnProject: existingByCode.size,
      },
    })
  }

  // ── Write ──────────────────────────────────────────────────────────────────
  let created = 0
  let updated = 0

  if (newRows.length) {
    const insertRows = newRows.map((v) => storeInsert(v, id, companyId))
    const { error } = await admin.from('project_stores').insert(insertRows)
    if (error) return NextResponse.json({ error: `Insert failed: ${error.message}` }, { status: 500 })
    created = newRows.length
  }

  if (mode === 'update' && existingRows.length) {
    for (const v of existingRows) {
      const targetId = existingByCode.get(v.branch_code.toUpperCase())!
      const { error } = await admin
        .from('project_stores')
        .update({
          store_name: v.store_name,
          town: v.town,
          rfid_m2_required: v.rfid_m2_required,
          start_date: v.start_date,
          end_date: v.end_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetId)
      if (!error) updated++
    }
  }

  await logProjectEvent(admin, {
    projectId: id,
    companyId,
    eventType: 'project.imported',
    newValue: `${created} created, ${updated} updated`,
    metadata: { mode, created, updated, invalid: preview.invalid.length },
    createdBy: userId,
  })
  await logAudit(admin, { actorId: userId, companyId, action: 'project.imported', entityType: 'project', entityId: id, metadata: { mode, created, updated } })

  revalidatePath(`/admin/projects/${id}`)
  revalidatePath('/admin/projects')
  revalidatePath('/regional/projects')
  return NextResponse.json({ created, updated, skipped: mode === 'add_new' ? existingRows.length : 0 })
}

function storeInsert(v: ParsedStore, projectId: string, companyId: string) {
  return {
    project_id: projectId,
    company_id: companyId,
    branch_code: v.branch_code,
    store_name: v.store_name,
    town: v.town,
    rfid_m2_required: v.rfid_m2_required,
    start_date: v.start_date,
    end_date: v.end_date,
  }
}
