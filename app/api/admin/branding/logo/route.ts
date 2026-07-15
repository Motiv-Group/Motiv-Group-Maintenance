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

  // Any subset of the three masters may be uploaded — only what's provided is
  // regenerated; the rest keep their current (or built-in) assets.
  const buffers: Partial<Record<(typeof MASTERS)[number], Buffer>> = {}
  for (const name of MASTERS) {
    const file = form.get(name)
    if (file == null || (file instanceof File && file.size === 0)) continue // not provided
    if (!(file instanceof File)) return NextResponse.json({ error: `Invalid ${name} upload` }, { status: 400 })
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: `${name} must be a PNG or WebP image` }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: `${name} is over 8MB` }, { status: 400 })
    buffers[name] = Buffer.from(await file.arrayBuffer())
  }
  if (!buffers.symbol && !buffers.wordmark && !buffers.lockup) {
    return NextResponse.json({ error: 'Upload at least one image (symbol, wordmark or lockup)' }, { status: 400 })
  }

  const current = await getAppSettings()
  const chromeHex = effectiveBrandHex(current.colors)['600']

  let generated
  try {
    generated = await generateBrandAssets({ ...buffers, chromeHex })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Generation failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // Versioned prefix → every generation gets unique, immutable public URLs
  // (no CDN cache-busting needed anywhere downstream).
  const version = Date.now()
  const prefix = `v${version}`
  const storage = admin.storage.from('branding')

  // Start from the current file/dim map and overlay only the regenerated assets,
  // so a partial upload keeps the untouched logos.
  const files: Record<string, string> = { ...current.branding.files }
  const dims: BrandingState['dims'] = { ...current.branding.dims }
  for (const asset of generated.web) {
    const path = `${prefix}/${asset.key}`
    const { error } = await storage.upload(path, asset.data, { contentType: asset.contentType, cacheControl: '31536000' })
    if (error) return NextResponse.json({ error: `Upload failed for ${asset.key}: ${error.message}` }, { status: 500 })
    files[asset.key] = storage.getPublicUrl(path).data.publicUrl
    // The UI needs the trimmed masters' aspect ratios to size custom logos.
    if (asset.key === 'symbol.png' || asset.key === 'wordmark.png' || asset.key === 'lockup.png') {
      const meta = await sharp(asset.data).metadata()
      if (meta.width && meta.height) dims[asset.key] = { w: meta.width, h: meta.height }
    }
  }

  // The asset pack is only regenerated when the symbol changed (it's mostly
  // icons); otherwise keep the previous pack.
  let zipUrl = current.branding.zipUrl
  if (generated.zip) {
    const zipPath = `${prefix}/motiv-asset-pack.zip`
    const { error: zipErr } = await storage.upload(zipPath, generated.zip, { contentType: 'application/zip', cacheControl: '31536000' })
    if (zipErr) return NextResponse.json({ error: `Zip upload failed: ${zipErr.message}` }, { status: 500 })
    zipUrl = storage.getPublicUrl(zipPath).data.publicUrl
  }

  try {
    const settings = await saveAppSettings({ branding: { version, files, dims, zipUrl } })
    // Best-effort orphan cleanup: any version folder no longer referenced by the
    // live file/zip URLs is safe to delete (a partial upload keeps several
    // versions referenced, so we can't just wipe the previous one).
    await cleanupOrphans(storage, files, zipUrl)
    await logAudit(admin, {
      actorId: user.id,
      action: 'customization.logo_generate',
      entityType: 'app_settings',
      entityId: 'app',
      metadata: { version, regenerated: generated.web.map(a => a.key) },
    })
    revalidatePath('/', 'layout')
    return NextResponse.json({ ok: true, settings })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Save failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** Delete any `v*` folder in the branding bucket not referenced by a live URL. */
async function cleanupOrphans(
  storage: ReturnType<ReturnType<typeof createAdminClient>['storage']['from']>,
  files: Record<string, string>,
  zipUrl: string | null,
): Promise<void> {
  try {
    const referenced = new Set<string>()
    for (const url of [...Object.values(files), ...(zipUrl ? [zipUrl] : [])]) {
      const m = /\/branding\/(v[^/]+)\//.exec(url)
      if (m) referenced.add(m[1])
    }
    const { data: entries } = await storage.list('', { limit: 1000 })
    const orphanFolders = (entries ?? []).filter(e => /^v\d+$/.test(e.name) && !referenced.has(e.name))
    for (const folder of orphanFolders) {
      const { data: contents } = await storage.list(folder.name, { limit: 1000 })
      if (contents?.length) await storage.remove(contents.map(c => `${folder.name}/${c.name}`))
    }
  } catch {
    // Cleanup is best-effort — never fail the save over stale files.
  }
}
