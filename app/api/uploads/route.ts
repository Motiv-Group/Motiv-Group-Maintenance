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

const MAX_BYTES = 15 * 1024 * 1024   // per-file, matches the bucket size limits
const MAX_FILES = 10
// Cumulative per-user storage cap across all buckets (abuse guard — the free-tier
// Supabase bucket is ~1 GB total). Tunable via MAX_USER_UPLOAD_BYTES; default 500 MB.
const MAX_USER_UPLOAD_BYTES = Number(process.env.MAX_USER_UPLOAD_BYTES) || 500 * 1024 * 1024

const IMG = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const DOCS = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/csv']
const BUCKET_MIME: Record<string, string[]> = {
  'ticket-photos':     IMG,
  'ticket-docs':       [...IMG, ...DOCS],
  'completion-docs':   [...IMG, 'application/pdf'],
  'quote-attachments': [...IMG, 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
  'supplier-docs':     [...IMG, 'application/pdf'],
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
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

  // Per-file validation up front. Files that fail never reach storage, so they
  // don't count toward the quota.
  const isValid = (f: File) => f.size <= MAX_BYTES && (!f.type || allowed.includes(f.type))
  const valid = files.filter(isValid)
  const failed: string[] = files.filter((f) => !isValid(f)).map((f) => f.name || 'file')
  const incoming = valid.reduce((sum, f) => sum + f.size, 0)

  // Reserve quota atomically BEFORE uploading, so concurrent batches can't both
  // slip past the cap. Fail-open if the quota infra isn't present yet (migration
  // not applied) — a missing function must never hard-break uploads.
  if (incoming > 0) {
    const { data: ok, error } = await (admin.rpc as any)('reserve_upload_quota', {
      p_user: user.id, p_bytes: incoming, p_cap: MAX_USER_UPLOAD_BYTES,
    })
    if (error) {
      console.error('[api/uploads] quota check unavailable, allowing:', error.message)
    } else if (ok === false) {
      return NextResponse.json({
        error: 'Upload limit reached for your account. Please contact support to raise it.',
      }, { status: 413 })
    }
  }

  const urls: string[] = []
  await Promise.all(valid.map(async (f) => {
    // Path is server-controlled and always prefixed with the caller's id.
    const safeName = (f.name || 'file').replace(/[^\w.\-]/g, '_')
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
    try {
      const buf = Buffer.from(await f.arrayBuffer())
      const { error } = await admin.storage.from(bucket).upload(path, buf, {
        contentType: f.type || 'application/octet-stream',
        upsert: true,
      })
      // A storage failure here leaves the reserved bytes counted (conservative —
      // it can only make the cap stricter, and storage errors are rare).
      if (error) { console.error('[api/uploads]', bucket, f.name, error.message); failed.push(f.name); return }
      urls.push(admin.storage.from(bucket).getPublicUrl(path).data.publicUrl)
    } catch (e: any) {
      console.error('[api/uploads] exception', bucket, f.name, e?.message)
      failed.push(f.name)
    }
  }))

  return NextResponse.json({ urls, failed })
}
