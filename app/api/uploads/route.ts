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
// Per-bucket allowlist. MUST stay a subset of each bucket's `allowed_mime_types`
// in supabase/schema.sql — Supabase Storage enforces that list even for
// service-role writes, so a type this route accepts but the bucket rejects
// still fails the upload. tests/api/uploads-validation.test.ts guards the two
// against drift. Exported for that test.
export const BUCKET_MIME: Record<string, string[]> = {
  'ticket-photos':     IMG,
  'ticket-docs':       [...IMG, ...DOCS],
  'completion-docs':   [...IMG, 'application/pdf'],
  'quote-attachments': [...IMG, 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
  'supplier-docs':     [...IMG, 'application/pdf'],
  'project-files':     [...IMG, 'application/pdf'],
}

// Extension → MIME fallback. Browsers/OSes sometimes report an empty or generic
// `File.type` (drag-and-drop, some Android pickers, files copied without
// extension metadata). We must NEVER send `application/octet-stream` to a bucket
// whose `allowed_mime_types` only lists specific image/pdf types — storage
// rejects it and the upload "fails" for no visible reason. So we resolve the
// effective type from the extension when the browser's is missing/generic, and
// both VALIDATE and UPLOAD with that effective type (guaranteed in-allowlist
// when valid). `image/jpg` (non-standard, emitted by a few libraries) is
// normalised to `image/jpeg`.
const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain', csv: 'text/csv',
}

/** The MIME type we will validate against and store the object as. Prefers the
 *  browser-reported type, falling back to the file extension when that is empty
 *  or the generic octet-stream. Returns octet-stream only when truly unknown
 *  (which then fails validation — an unidentifiable file can't be trusted). */
export function effectiveType(f: File): string {
  const raw = (f.type || '').trim().toLowerCase()
  if (raw && raw !== 'application/octet-stream') {
    return raw === 'image/jpg' ? 'image/jpeg' : raw
  }
  const ext = (f.name.split('.').pop() || '').toLowerCase()
  return EXT_MIME[ext] ?? 'application/octet-stream'
}

export async function POST(req: NextRequest) {
  // The ENTIRE handler is wrapped so it can NEVER return a bare Next 500 (empty
  // body the client can't read — the "500 undefined" we saw in production). Any
  // unhandled throw — createAdminClient() with a missing SUPABASE_SERVICE_ROLE_KEY,
  // a cookies()/auth failure, an unexpected storage exception — is converted to a
  // structured JSON 500 the uploader can surface, with the real reason logged.
  try {
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

    // Service-role client. Constructing it THROWS when SUPABASE_SERVICE_ROLE_KEY
    // (or the Supabase URL) is unset/empty — a common cause of a 500 on a fresh
    // Preview/prod env where the anon-key login still works. The outer try turns
    // that into a readable JSON 500 rather than an opaque crash.
    const admin = createAdminClient()

    // Per-file validation up front. Files that fail never reach storage, so they
    // don't count toward the quota. Validate against the EFFECTIVE type (see
    // effectiveType) — never the raw browser type — so an empty/generic type on a
    // recognisable file isn't waved through only to be rejected by the bucket at
    // upload time. Pair the resolved type with the file so upload reuses it.
    // `errors` carries a per-file reason so the client/console can say WHY a file
    // failed instead of a generic "failed to upload".
    const typed = files.map((f) => ({ f, type: effectiveType(f) }))
    const isValid = (t: { f: File; type: string }) => t.f.size <= MAX_BYTES && allowed.includes(t.type)
    const valid = typed.filter(isValid)
    const failed: string[] = []
    const errors: Array<{ name: string; reason: string }> = []
    for (const t of typed) {
      if (isValid(t)) continue
      const name = t.f.name || 'file'
      failed.push(name)
      errors.push({ name, reason: t.f.size > MAX_BYTES ? `File exceeds the ${MAX_BYTES / (1024 * 1024)} MB limit.` : 'Unsupported file type.' })
    }
    const incoming = valid.reduce((sum, t) => sum + t.f.size, 0)

    // Reserve quota atomically BEFORE uploading, so concurrent batches can't both
    // slip past the cap. Fail-open if the quota infra isn't present yet (migration
    // not applied) — a missing function must never hard-break uploads. Guarded so
    // a REJECTED rpc (network blip) also fails open instead of 500ing the upload.
    if (incoming > 0) {
      try {
        // BIND to the client. `admin.rpc` on its own is a DETACHED method and
        // supabase-js implements rpc as `return this.rest.rpc(...)` — so calling
        // it unbound throws a synchronous TypeError (`this` is undefined in strict
        // ESM) on every upload that has files. That was the production
        // "500 undefined". reserve_upload_quota isn't in the generated DB types
        // (the Functions block is empty) — keep the narrow cast for this one call.
        const reserveQuota = admin.rpc.bind(admin) as unknown as (
          fn: 'reserve_upload_quota',
          args: { p_user: string; p_bytes: number; p_cap: number },
        ) => Promise<{ data: boolean | null; error: { message: string } | null }>
        const { data: ok, error } = await reserveQuota('reserve_upload_quota', {
          p_user: user.id, p_bytes: incoming, p_cap: MAX_USER_UPLOAD_BYTES,
        })
        if (error) {
          console.error('[api/uploads] quota check unavailable, allowing:', error.message)
        } else if (ok === false) {
          return NextResponse.json({
            error: 'Upload limit reached for your account. Please contact support to raise it.',
          }, { status: 413 })
        }
      } catch (e) {
        console.error('[api/uploads] quota check threw, allowing:', e instanceof Error ? e.message : e)
      }
    }

    const urls: string[] = []
    await Promise.all(valid.map(async ({ f, type }) => {
      // Path is server-controlled and always prefixed with the caller's id.
      const safeName = (f.name || 'file').replace(/[^\w.\-]/g, '_')
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
      const name = f.name || 'file'
      try {
        const buf = Buffer.from(await f.arrayBuffer())
        // Store as the effective (validated) type — guaranteed to be in the
        // bucket's allowed_mime_types, so storage never rejects a validated file.
        const { error } = await admin.storage.from(bucket).upload(path, buf, {
          contentType: type,
          upsert: true,
        })
        // A storage failure here leaves the reserved bytes counted (conservative —
        // it can only make the cap stricter, and storage errors are rare).
        if (error) { console.error('[api/uploads]', bucket, name, error.message); failed.push(name); errors.push({ name, reason: error.message }); return }
        urls.push(admin.storage.from(bucket).getPublicUrl(path).data.publicUrl)
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e)
        console.error('[api/uploads] exception', bucket, name, reason)
        failed.push(name); errors.push({ name, reason })
      }
    }))

    return NextResponse.json({ urls, failed, errors })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[api/uploads] unhandled error:', msg)
    return NextResponse.json({ error: 'Upload failed on the server. Please try again.' }, { status: 500 })
  }
}
