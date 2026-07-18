import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import sharp from 'sharp'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

// POST /api/admin/companies/logo — system_admin uploads a logo for a company.
// The image is re-encoded via sharp (strips EXIF, rejects malformed files),
// squared to a small logo, and stored in the public `branding` bucket under
// company-logos/. The resulting public URL is persisted on companies.logo_url.
// FormData: companyId, file.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`admin-company-logo:${user.id}`, 30, 600_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'system_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 }) }
  const companyId = String(form.get('companyId') ?? '').trim()
  const file = form.get('file')
  if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Logo must be PNG, JPEG or WebP' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Logo is over 8MB' }, { status: 400 })

  const { data: company } = await admin.from('companies').select('id').eq('id', companyId).single()
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  let processed: Buffer
  try {
    processed = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate() // honour EXIF orientation before it gets stripped
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()
  } catch {
    return NextResponse.json({ error: 'Image could not be read' }, { status: 400 })
  }

  const path = `company-logos/${companyId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`
  const storage = admin.storage.from('branding')
  const { error: upErr } = await storage.upload(path, processed, { contentType: 'image/webp', cacheControl: '31536000' })
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })

  const url = storage.getPublicUrl(path).data.publicUrl
  const { error: dbErr } = await admin.from('companies').update({ logo_url: url }).eq('id', companyId)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  await logAudit(admin, { actorId: user.id, companyId, action: 'admin.company_logo', entityType: 'company', entityId: companyId })
  revalidatePath('/admin/accounts')
  return NextResponse.json({ ok: true, url })
}
