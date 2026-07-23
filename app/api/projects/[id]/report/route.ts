import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { readFile } from 'fs/promises'
import path from 'path'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { getAppSettings } from '@/lib/settings-server'
import { effectiveBrandHex, type AppSettings } from '@/lib/settings'
import { formatDate } from '@/lib/utils'
import { loadProjectReportData, type ReportPhoto, type StoreRow, type ProjectSummary } from '@/lib/reports/data'
import { rmCanSeeProject } from '@/lib/projects/data'
import { renderProjectReport, type RenderStore, type RenderReport, type RenderPhoto } from '@/lib/reports/ProjectReport'
import { photoToDataUri } from '@/lib/reports/photos'
import { buildProjectExcel } from '@/lib/reports/projectExcel'
import { buildProjectZip, safeName, type ZipStore } from '@/lib/reports/projectZip'
import { downloadStorageObject, extOf } from '@/lib/storage'

export const runtime = 'nodejs'
export const maxDuration = 60

// Cap before/after photos EMBEDDED in a PDF — keeps the PDF + function memory light on
// the free tier. The ZIP bundles the full-res originals separately (uncapped).
const MAX_PHOTOS_PER_GROUP = 3

const STORE_STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started', on_site: 'On site', before_complete: 'Before done', after_complete: 'After done', complete: 'Complete',
}
const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : s
const slug = (s: string) => (s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project'

interface ReportOptions { pdf: boolean; excel: boolean; scope: 'all' | 'completed'; zip: boolean }

// Body is optional (a bare POST → the legacy plain-PDF behaviour). Unknown/extra keys ignored.
function parseOptions(body: unknown): ReportOptions {
  const b = (body && typeof body === 'object') ? body as Record<string, unknown> : {}
  const pdf = b.pdf === undefined ? true : !!b.pdf
  const excel = !!b.excel
  return {
    pdf: pdf || (!pdf && !excel), // always keep at least one format
    excel,
    scope: b.scope === 'completed' ? 'completed' : 'all',
    zip: !!b.zip,
  }
}

// POST /api/projects/[id]/report — generate an on-brand export for the project and
// stream it back as a download (PDF, Excel, or a master ZIP with a folder per store).
// Gated to a system_admin or the RM assigned to the project; rate-limited; audited.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`project-report:${user.id}`, 6, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const opts = parseOptions(await req.json().catch(() => ({})))

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Access: system_admin (resolves the project's own company) or an RM assigned to it.
  let companyId: string | null = me.company_id
  if (me.role === 'system_admin') {
    const { data: proj } = await admin.from('projects').select('company_id').eq('id', projectId).maybeSingle()
    if (!proj) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    companyId = proj.company_id
  } else if (me.role === 'regional_manager') {
    if (!(await rmCanSeeProject(admin, user.id, projectId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!companyId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    return await generate(admin, companyId, projectId, user.id, opts)
  } catch (e) {
    Sentry.captureException(e, { tags: { route: 'project-report' }, extra: { projectId, companyId } })
    console.error('[project-report] generation failed:', e)
    return NextResponse.json({ error: 'Report generation failed. This has been logged — try again shortly.' }, { status: 500 })
  }
}

async function generate(admin: ReturnType<typeof createAdminClient>, companyId: string, projectId: string, actorId: string, opts: ReportOptions): Promise<NextResponse> {
  const data = await loadProjectReportData(companyId, projectId) // access already enforced above
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const settings = await getAppSettings()
  const brandHex = effectiveBrandHex(settings.colors)['600']
  const logoDataUri = await resolveLogo(settings)
  const generatedAt = formatDate(new Date().toISOString())

  // Scope filter: all stores, or only the fully-complete ones.
  const stores = opts.scope === 'completed' ? data.stores.filter(s => s.status === 'complete') : data.stores
  const summary = recomputeSummary(data.summary, stores)

  const capPhotos = async (list: ReportPhoto[]): Promise<RenderPhoto[]> => {
    const chosen = list.slice(0, MAX_PHOTOS_PER_GROUP)
    const uris = await Promise.all(chosen.map(x => photoToDataUri(x.url)))
    return uris.flatMap((dataUri, i) => dataUri ? [{ dataUri, caption: chosen[i].caption }] : [])
  }
  const d = (v: string | null | undefined) => (v ? formatDate(v) : null)
  const renderStores: RenderStore[] = await Promise.all(stores.map(async (st): Promise<RenderStore> => {
    const p = data.photosByStore[st.id] ?? { before: [], after: [], coc: [] }
    const [before, after] = await Promise.all([capPhotos(p.before), capPhotos(p.after)])
    return {
      branchCode: st.branch_code, name: st.store_name ?? '', town: st.town ?? null,
      progress: st.progress, statusLabel: STORE_STATUS_LABEL[st.status] ?? cap(st.status), overdue: st.overdue,
      startDate: d(st.start_date), endDate: d(st.end_date),
      milestones: [
        { label: 'On site', done: !!st.on_site_completed_at, date: d(st.on_site_completed_at) },
        { label: 'Before', done: !!st.before_photos_completed_at, date: d(st.before_photos_completed_at) },
        { label: 'After', done: !!st.after_photos_completed_at, date: d(st.after_photos_completed_at) },
        { label: 'Sign-off', done: !!st.signoff_completed_at, date: d(st.signoff_completed_at) },
      ],
      before, after,
    }
  }))

  const baseReport = (rs: RenderStore[]): RenderReport => ({
    appName: settings.appName || 'Motiv',
    brandHex, logoDataUri, generatedAt,
    project: {
      name: data.project.name, client: data.project.client_name ?? null, region: null,
      statusLabel: cap(summary.status),
      startDate: summary.start_date ? formatDate(summary.start_date) : null,
      endDate: summary.end_date ? formatDate(summary.end_date) : null,
      progress: summary.progress,
    },
    summary: { stores: summary.storeCount, completed: summary.completed, inProgress: summary.inProgress, notStarted: summary.notStarted, overdue: summary.overdue },
    stores: rs,
  })

  const name = slug(data.project.name)
  const summaryPdf = (opts.pdf || opts.zip) ? await renderProjectReport(baseReport(renderStores)) : null
  const summaryXlsx = (opts.excel || opts.zip) ? await buildProjectExcel(data.project, summary, stores, generatedAt, brandHex) : null

  await logAudit(admin, { actorId, companyId, action: 'project.report_generated', entityType: 'project', entityId: projectId, metadata: { stores: stores.length, formats: { pdf: opts.pdf, excel: opts.excel }, scope: opts.scope, zip: opts.zip } })

  // ── ZIP: one master archive (summary at root + a folder per store) ──
  if (opts.zip) {
    const zipStores: ZipStore[] = await Promise.all(stores.map(async (st, i): Promise<ZipStore> => {
      const storePdf = await renderProjectReport(baseReport([renderStores[i]]))
      const p = data.photosByStore[st.id] ?? { before: [], after: [], coc: [] }
      const photos = await collectPhotos(p)
      return { folder: safeName(`${st.branch_code}-${st.store_name ?? ''}`), pdf: storePdf, photos }
    }))
    const zip = await buildProjectZip({
      slug: name,
      summaryPdf: opts.pdf ? summaryPdf : null,
      summaryXlsx: opts.excel ? summaryXlsx : null,
      stores: zipStores,
    })
    return download(zip, 'application/zip', `${name}-report.zip`)
  }

  // ── No ZIP: single file, or a small 2-file zip when both formats are picked ──
  if (opts.pdf && opts.excel) {
    const zip = await buildProjectZip({ slug: name, summaryPdf, summaryXlsx, stores: [] })
    return download(zip, 'application/zip', `${name}-report.zip`)
  }
  if (opts.excel && summaryXlsx) return download(summaryXlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${name}-report.xlsx`)
  return download(summaryPdf!, 'application/pdf', `${name}-report.pdf`)
}

// Download all original before/after/COC photos for a store, named by category.
async function collectPhotos(p: { before: ReportPhoto[]; after: ReportPhoto[]; coc: ReportPhoto[] }): Promise<{ name: string; bytes: Buffer }[]> {
  const groups: [string, ReportPhoto[]][] = [['before', p.before], ['after', p.after], ['COC', p.coc]]
  const out: { name: string; bytes: Buffer }[] = []
  for (const [label, list] of groups) {
    const dls = await Promise.all(list.map(x => downloadStorageObject(x.path).then(r => ({ r, ext: extOf(x.path) }))))
    dls.forEach(({ r, ext }, i) => {
      if (r) out.push({ name: `${label}_${String(i + 1).padStart(2, '0')}.${ext}`, bytes: r.bytes })
    })
  }
  return out
}

function recomputeSummary(base: ProjectSummary, stores: StoreRow[]): ProjectSummary {
  return {
    ...base,
    storeCount: stores.length,
    completed: stores.filter(s => s.status === 'complete').length,
    inProgress: stores.filter(s => s.status !== 'complete' && s.status !== 'not_started').length,
    notStarted: stores.filter(s => s.status === 'not_started').length,
    overdue: stores.filter(s => s.overdue).length,
    progress: stores.length ? Math.round(stores.reduce((a, s) => a + s.progress, 0) / stores.length) : 0,
  }
}

function download(body: Buffer, contentType: string, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

// Effective logo for the cover: the admin-customized icon if set (fetched), else the
// built-in charcoal-tile PWA icon (always visible on a white page). Never throws.
async function resolveLogo(settings: AppSettings): Promise<string | null> {
  const custom = settings.branding?.files?.['icon-192.png']
  if (custom) {
    const uri = await photoToDataUri(custom, 96)
    if (uri) return uri
  }
  try {
    const buf = await readFile(path.join(process.cwd(), 'public', 'icon-192.png'))
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
