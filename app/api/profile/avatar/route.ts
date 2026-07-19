import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import sharp from 'sharp'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

// POST /api/profile/avatar — the signed-in user sets their OWN profile picture.
// The image is re-encoded via sharp (strips EXIF, rejects malformed files) and
// squared, stored in the public `branding` bucket under avatars/, and the public
// URL is persisted on their user_profiles.avatar_url. FormData: file.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`avatar:${user.id}`, 20, 600_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 }) }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Image must be PNG, JPEG or WebP' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image is over 8MB' }, { status: 400 })

  let processed: Buffer
  try {
    processed = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate() // honour EXIF orientation before it's stripped
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer()
  } catch {
    return NextResponse.json({ error: 'Image could not be read' }, { status: 400 })
  }

  const admin = createAdminClient()
  const path = `avatars/${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`
  const storage = admin.storage.from('branding')
  const { error: upErr } = await storage.upload(path, processed, { contentType: 'image/webp', cacheControl: '31536000' })
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })

  const url = storage.getPublicUrl(path).data.publicUrl
  const { error: dbErr } = await admin.from('user_profiles').update({ avatar_url: url }).eq('id', user.id)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  revalidatePath('/settings/profile')
  return NextResponse.json({ ok: true, url })
}

// DELETE /api/profile/avatar — clear the avatar (revert to initials).
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const admin = createAdminClient()
  const { error } = await admin.from('user_profiles').update({ avatar_url: null }).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath('/settings/profile')
  return NextResponse.json({ ok: true })
}
