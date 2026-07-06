import { createClient } from '@/lib/supabase/client'

/**
 * Client-side: upload ticket photos in PARALLEL and report failures loudly.
 * The old per-form loops uploaded sequentially and silently skipped failures,
 * so a ticket could submit with fewer photos than the user attached (evidence
 * quietly lost). Callers must block submit when `failed` is non-empty.
 * A random suffix keeps parallel uploads (same ms) and same-named camera files
 * from colliding on the storage path.
 */
export async function uploadTicketPhotos(
  files: File[],
  userId: string | null | undefined,
  bucket = 'ticket-photos'
): Promise<{ urls: string[]; failed: string[] }> {
  const supabase = createClient()
  const results = await Promise.all(files.map(async (f) => {
    const path = `${userId ?? 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.name.replace(/[^\w.\-]/g, '_')}`
    const { error } = await supabase.storage.from(bucket).upload(path, f, { upsert: true })
    if (error) {
      // Surface the real reason (RLS 403, mime 415, size 413, network…) instead of
      // swallowing it — a silent "check your connection" hid a storage-RLS bug.
      console.error(`[upload] ${bucket}/${f.name} failed:`, error.message)
      return { ok: false as const, name: f.name }
    }
    return { ok: true as const, url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl }
  }))
  return {
    urls: results.flatMap(r => (r.ok ? [r.url] : [])),
    failed: results.flatMap(r => (r.ok ? [] : [r.name])),
  }
}
