import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'

// Server-side file upload. The browser can't upload directly to Supabase Storage
// on this project — the storage RLS context doesn't receive the user's JWT
// claims, so auth.uid()/auth.role() are null there and every authenticated
// insert 403s. Instead the browser POSTs files here; we authenticate via the
// session cookie (which DOES work), validate, and write with the service-role
// client (RLS bypass). The object path is forced to `<userId>/…` server-side, so
// a user can only ever write under their own prefix (audit B5 hardening).
export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 15 * 1024 * 1024   // matches the bucket size limits
const MAX_FILES = 10

const IMG = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const BUCKET_MIME: Record<string, string[]> = {
  'ticket-photos':     IMG,
  'completion-docs':   [...IMG, 'application/pdf'],
  'quote-attachments': [...IMG, 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
  'supplier-docs':     [...IMG, 'application/pdf'],
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await rateLimit(`upload:${user.id}`, 60, 60_000))) {
    return NextResponse.json({ error: 'Too many uploads — try again shortly.' }, { status: 429 })
  }

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 }) }

  const bucket = String(form.get('bucket') ?? 'ticket-photos')
  const allowed = BUCKET_MIME[bucket]
  if (!allowed) return NextResponse.json({ error: 'Invalid bucket' }, { status: 400 })

  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (!files.length) return NextResponse.json({ error: 'No files' }, { status: 400 })
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Too many files (max ${MAX_FILES})` }, { status: 400 })

  const admin = createAdminClient()
  const urls: string[] = []
  const failed: string[] = []

  await Promise.all(files.map(async (f) => {
    if (f.size > MAX_BYTES) { failed.push(f.name); return }
    if (f.type && !allowed.includes(f.type)) { failed.push(f.name); return }
    // Path is server-controlled and always prefixed with the caller's id.
    const safeName = (f.name || 'file').replace(/[^\w.\-]/g, '_')
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
    try {
      const buf = Buffer.from(await f.arrayBuffer())
      const { error } = await admin.storage.from(bucket).upload(path, buf, {
        contentType: f.type || 'application/octet-stream',
        upsert: true,
      })
      if (error) { console.error('[api/uploads]', bucket, f.name, error.message); failed.push(f.name); return }
      urls.push(admin.storage.from(bucket).getPublicUrl(path).data.publicUrl)
    } catch (e: any) {
      console.error('[api/uploads] exception', bucket, f.name, e?.message)
      failed.push(f.name)
    }
  }))

  return NextResponse.json({ urls, failed })
}
