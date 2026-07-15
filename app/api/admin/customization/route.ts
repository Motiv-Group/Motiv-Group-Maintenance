import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'
import { saveAppSettings } from '@/lib/settings-server'
import { BRAND_STOPS, DEFAULT_SETTINGS, type AppSettings, type BrandStop } from '@/lib/settings'

const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const BodySchema = z.object({
  appName: z.string().trim().min(1).max(40).optional(),
  tagline: z.string().max(120).optional(),
  supportEmail: z.string().max(200).refine(v => v === '' || z.string().email().safeParse(v).success, 'Invalid email').optional(),
  supportPhone: z.string().max(40).optional(),
  defaultTheme: z.enum(['light', 'dark', 'system']).optional(),
  colors: z.record(z.string(), HEX).optional(),
  authButtonColor: HEX.optional(),
  authBgUrls: z.array(z.string().url()).max(4).optional(),
  // Logo sizing/alignment — numbers are re-clamped server-side by normaliseLogoLayout.
  logo: z.object({
    navSymbolScale: z.number(),
    navWordmarkScale: z.number(),
    navWordmarkNudge: z.number(),
    authLogoScale: z.number(),
    authLogoScaleMobile: z.number(),
    authLogoGap: z.number(),
  }).partial().optional(),
  // Email copy overrides — keys/fields/values are whitelisted server-side by
  // normaliseEmails; loose here so an unknown key is dropped, not rejected.
  emails: z.record(z.string().max(40), z.record(z.string().max(40), z.string().max(2000))).optional(),
  // Drops the generated logo set and returns the app to the built-in Motiv assets.
  resetBranding: z.boolean().optional(),
})

// POST /api/admin/customization — system_admin saves Customize-tab settings
// (identity, colours, login backgrounds, support contact, default theme).
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`admin-customization:${user.id}`, 30, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'system_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data

  const patch: Partial<Omit<AppSettings, 'logo'>> & { logo?: Partial<AppSettings['logo']> } = {}
  if (body.appName !== undefined) patch.appName = body.appName
  if (body.authButtonColor !== undefined) patch.authButtonColor = body.authButtonColor.toLowerCase()
  // Whitelisted + cleaned by normaliseEmails (in saveAppSettings); '' fields clear an override.
  if (body.emails !== undefined) patch.emails = body.emails as AppSettings['emails']
  if (body.tagline !== undefined) patch.tagline = body.tagline
  if (body.supportEmail !== undefined) patch.supportEmail = body.supportEmail
  if (body.supportPhone !== undefined) patch.supportPhone = body.supportPhone
  if (body.defaultTheme !== undefined) patch.defaultTheme = body.defaultTheme
  if (body.colors !== undefined) {
    // Only known stops survive; sending {} clears every override (factory reset).
    const colors: Partial<Record<BrandStop, string>> = {}
    for (const stop of BRAND_STOPS) if (body.colors[stop]) colors[stop] = body.colors[stop].toLowerCase()
    patch.colors = colors
  }
  if (body.authBgUrls !== undefined) {
    // Login backgrounds must live in OUR public branding bucket — an arbitrary
    // external URL here would let a compromised admin token deface the login page
    // with third-party content (and leak visitor IPs to that host).
    const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/branding/`
    const bad = body.authBgUrls.find(u => !u.startsWith(prefix))
    if (bad) return NextResponse.json({ error: 'Background images must be uploaded through the Customize tab' }, { status: 400 })
    patch.authBgUrls = body.authBgUrls
  }
  // Raw partial — saveAppSettings deep-merges over the current layout and
  // normaliseSettings clamps every value to its safe range.
  if (body.logo !== undefined) patch.logo = body.logo
  if (body.resetBranding) patch.branding = { ...DEFAULT_SETTINGS.branding, files: {}, dims: {} }

  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })

  try {
    const settings = await saveAppSettings(patch)
    await logAudit(admin, {
      actorId: user.id,
      action: 'customization.save',
      entityType: 'app_settings',
      entityId: 'app',
      metadata: { fields: Object.keys(patch) },
    })
    revalidatePath('/', 'layout')
    return NextResponse.json({ ok: true, settings })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Save failed'
    // Most likely cause: the app_settings migration hasn't been applied yet.
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
