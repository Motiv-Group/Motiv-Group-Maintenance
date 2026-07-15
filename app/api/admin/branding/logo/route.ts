import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import sharp from 'sharp'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { saveAppSettings, getAppSettings } from '@/lib/settings-server'
import { effectiveBrandHex, type BrandingState } from '@/lib/settings'
import { generateBrandAssets } from '@/lib/branding/generate'

// Icon generation over three large masters takes real CPU time.
export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/webp'])
const MASTERS = ['symbol', 'wordmark', 'lockup'] as const

// POST /api/admin/branding/logo — system_admin uploads the three master logo
// images; every icon/favicon/launcher size is generated (lib/branding/generate),
// stored under a fresh version prefix in the public `branding` bucket, applied
// to the web app instantly via app_settings, and bundled as a downloadable zip
// for the repo + Android rebuild.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`admin-branding-logo:${user.id}`, 5, 600_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'system_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 }) }

  const buffers: Record<(typeof MASTERS)[number], Buffer> = {} as any
  for (const name of MASTERS) {
    const file = form.get(name)
    if (!(file instanceof File)) return NextResponse.json({ error: `Missing ${name} image` }, { status: 400 })
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: `${name} must be a PNG or WebP image` }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: `${name} is over 8MB` }, { status: 400 })
    buffers[name] = Buffer.from(await file.arrayBuffer())
  }

  const current = await getAppSettings()
  const chromeHex = effectiveBrandHex(current.colors)['600']

  let generated
  try {
    generated = await generateBrandAssets({
      symbol: buffers.symbol,
      wordmark: buffers.wordmark,
      lockup: buffers.lockup,
      chromeHex,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Generation failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // Versioned prefix → every generation gets unique, immutable public URLs
  // (no CDN cache-busting needed anywhere downstream).
  const version = Date.now()
  const prefix = `v${version}`
  const storage = admin.storage.from('branding')

  const files: Record<string, string> = {}
  for (const asset of generated.web) {
    const path = `${prefix}/${asset.key}`
    const { error } = await storage.upload(path, asset.data, { contentType: asset.contentType, cacheControl: '31536000' })
    if (error) return NextResponse.json({ error: `Upload failed for ${asset.key}: ${error.message}` }, { status: 500 })
    files[asset.key] = storage.getPublicUrl(path).data.publicUrl
  }

  const zipPath = `${prefix}/motiv-asset-pack.zip`
  const { error: zipErr } = await storage.upload(zipPath, generated.zip, { contentType: 'application/zip', cacheControl: '31536000' })
  if (zipErr) return NextResponse.json({ error: `Zip upload failed: ${zipErr.message}` }, { status: 500 })
  const zipUrl = storage.getPublicUrl(zipPath).data.publicUrl

  // Natural dimensions of the trimmed masters — the UI components need the
  // aspect ratios to size custom logos correctly.
  const dims: BrandingState['dims'] = {}
  for (const key of ['symbol.png', 'wordmark.png', 'lockup.png']) {
    const asset = generated.web.find(a => a.key === key)
    if (!asset) continue
    const meta = await sharp(asset.data).metadata()
    if (meta.width && meta.height) dims[key] = { w: meta.width, h: meta.height }
  }

  try {
    const settings = await saveAppSettings({ branding: { version, files, dims, zipUrl } })
    // Best-effort: drop the previous generation's files (free-tier storage; the
    // new versioned prefix is already live so nothing references the old one).
    if (current.branding.version && current.branding.version !== version) {
      const oldPrefix = `v${current.branding.version}`
      const { data: oldFiles } = await storage.list(oldPrefix)
      if (oldFiles?.length) await storage.remove(oldFiles.map(o => `${oldPrefix}/${o.name}`))
    }
    await logAudit(admin, {
      actorId: user.id,
      action: 'customization.logo_generate',
      entityType: 'app_settings',
      entityId: 'app',
      metadata: { version, assetCount: generated.web.length },
    })
    revalidatePath('/', 'layout')
    return NextResponse.json({ ok: true, settings })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Save failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
