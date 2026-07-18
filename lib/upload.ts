/**
 * Client-side file upload helpers. All uploads go through the server route
 * `POST /api/uploads` (never browser→storage directly).
 *
 * Why: on this Supabase project the storage RLS context never receives the
 * user's JWT claims, so `auth.uid()`/`auth.role()` are null in `storage.objects`
 * policies and every authenticated insert 403s. The route authenticates via the
 * session cookie (which works), validates MIME/size, forces a per-user object
 * path (`<userId>/…`), and writes with the service-role client.
 */

/** Upload many files to `bucket`; returns the stored URLs and the names that
 *  failed. Callers must block submit / surface failures when `failed` is
 *  non-empty (never let a form submit with fewer files than the user attached). */
export async function uploadFiles(
  files: File[],
  bucket: string
): Promise<{ urls: string[]; failed: string[] }> {
  if (!files.length) return { urls: [], failed: [] }
  const form = new FormData()
  form.append('bucket', bucket)
  for (const f of files) form.append('files', f)
  try {
    const res = await fetch('/api/uploads', { method: 'POST', body: form })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      console.error('[upload] /api/uploads failed:', res.status, d?.error)
      return { urls: [], failed: files.map(f => f.name) }
    }
    const data = await res.json()
    return { urls: data.urls ?? [], failed: data.failed ?? [] }
  } catch (e) {
    console.error('[upload] network error:', e instanceof Error ? e.message : e)
    return { urls: [], failed: files.map(f => f.name) }
  }
}

/** Upload a single file and return its URL; throws if it fails (for callers that
 *  need the URL inline). */
export async function uploadOne(file: File, bucket: string): Promise<string> {
  const { urls, failed } = await uploadFiles([file], bucket)
  if (failed.length || !urls[0]) throw new Error(`Upload failed: ${file.name}`)
  return urls[0]
}

/** Back-compat wrapper for the log-a-ticket forms. The `userId` arg is ignored —
 *  the server derives the real user from the session (the client can't spoof it). */
export async function uploadTicketPhotos(
  files: File[],
  _userId?: string | null,
  bucket = 'ticket-photos'
): Promise<{ urls: string[]; failed: string[] }> {
  return uploadFiles(files, bucket)
}
