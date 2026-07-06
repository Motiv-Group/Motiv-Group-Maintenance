/**
 * Client-side: upload ticket photos/documents via the server route `/api/uploads`
 * and report failures loudly. Callers must block submit when `failed` is
 * non-empty (never let a ticket submit with fewer files than the user attached).
 *
 * Why a server route (not a direct browser→storage upload): on this Supabase
 * project the storage RLS context never receives the user's JWT claims, so
 * `auth.uid()`/`auth.role()` are null there and every authenticated insert 403s.
 * The route authenticates via the session cookie (which works), validates
 * MIME/size, forces a per-user object path, and writes with the service-role
 * client. The `userId` arg is kept for call-site compatibility but the server
 * derives the real user from the session — the client can't spoof it.
 */
export async function uploadTicketPhotos(
  files: File[],
  _userId?: string | null,
  bucket = 'ticket-photos'
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
  } catch (e: any) {
    console.error('[upload] network error:', e?.message)
    return { urls: [], failed: files.map(f => f.name) }
  }
}
