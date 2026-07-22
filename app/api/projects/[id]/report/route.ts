import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { getAppSettings } from '@/lib/settings-server'
import { effectiveBrandHex, type AppSettings } from '@/lib/settings'
import { formatDate } from '@/lib/utils'
import { loadProjectReportData } from '@/lib/reports/data'
import { rmCanSeeProject } from '@/lib/projects/data'
import { renderProjectReport, type RenderStore, type RenderReport, type RenderPhoto } from '@/lib/reports/ProjectReport'
import { photoToDataUri } from '@/lib/reports/photos'

export const runtime = 'nodejs'
export const maxDuration = 60

// Cap before/after photos per store — keeps the PDF + function memory light on the
// free tier (a full 173-page full-res report would blow the Hobby limits).
const MAX_PHOTOS_PER_GROUP = 3

const STORE_STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started', on_site: 'On site', before_complete: 'Before done', after_complete: 'After done', complete: 'Complete',
}
const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : s
const slug = (s: string) => (s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project'

// POST /api/projects/[id]/report — generate an on-brand PDF report for the project
// and stream it back as a download. Gated to a system_admin or the regional manager
// assigned to the project; rate-limited (generation is expensive); audited.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`project-report:${user.id}`, 6, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

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

  const data = await loadProjectReportData(companyId, projectId) // access already enforced above
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const settings = await getAppSettings()
  const brandHex = effectiveBrandHex(settings.colors)['600']
  const logoDataUri = await resolveLogo(settings)

  const capPhotos = async (list: { url: string; caption: string | null }[]): Promise<RenderPhoto[]> => {
    const chosen = list.slice(0, MAX_PHOTOS_PER_GROUP)
    const uris = await Promise.all(chosen.map(x => photoToDataUri(x.url)))
    return uris.flatMap((dataUri, i) => dataUri ? [{ dataUri, caption: chosen[i].caption }] : [])
  }

  const stores: RenderStore[] = await Promise.all(data.stores.map(async (st): Promise<RenderStore> => {
    const p = data.photosByStore[st.id] ?? { before: [], after: [] }
    const [before, after] = await Promise.all([capPhotos(p.before), capPhotos(p.after)])
    const d = (v: string | null | undefined) => (v ? formatDate(v) : null)
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

  const report: RenderReport = {
    appName: settings.appName || 'Motiv',
    brandHex, logoDataUri, generatedAt: formatDate(new Date().toISOString()),
    project: {
      name: data.project.name, client: data.project.client_name ?? null, region: null,
      statusLabel: cap(data.summary.status),
      startDate: data.summary.start_date ? formatDate(data.summary.start_date) : null,
      endDate: data.summary.end_date ? formatDate(data.summary.end_date) : null,
      progress: data.summary.progress,
    },
    summary: { stores: data.summary.storeCount, completed: data.summary.completed, inProgress: data.summary.inProgress, notStarted: data.summary.notStarted, overdue: data.summary.overdue },
    stores,
  }

  const pdf = await renderProjectReport(report)
  await logAudit(admin, { actorId: user.id, companyId, action: 'project.report_generated', entityType: 'project', entityId: projectId, metadata: { stores: stores.length } })

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${slug(data.project.name)}-report.pdf"`,
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
