import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isPlatformOwner } from '@/lib/platform-owner'
import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

// POST /api/admin/branding/upload — system_admin uploads a single image for the
// Customize tab (login-screen backgrounds). The image is re-encoded via sharp
// (strips EXIF/location metadata, rejects malformed files) and stored in the
// public `branding` bucket; the caller persists the URL via
// POST /api/admin/customization.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`admin-branding-upload:${user.id}`, 20, 600_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'system_admin' || !isPlatformOwner(user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 }) }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Image must be PNG, JPEG or WebP' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image is over 8MB' }, { status: 400 })

  let processed: Buffer
  try {
    processed = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate() // honour EXIF orientation before it gets stripped
      .resize(2560, 2560, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
  } catch {
    return NextResponse.json({ error: 'Image could not be read' }, { status: 400 })
  }

  const path = `authbg/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`
  const storage = admin.storage.from('branding')
  const { error } = await storage.upload(path, processed, { contentType: 'image/webp', cacheControl: '31536000' })
  if (error) return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 })

  return NextResponse.json({ ok: true, url: storage.getPublicUrl(path).data.publicUrl })
}
