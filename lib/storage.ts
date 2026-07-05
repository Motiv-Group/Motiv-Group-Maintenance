import { createAdminClient } from '@/lib/supabase/server'

// The three private buckets. Reads must go through short-lived SIGNED URLs, not
// permanent public URLs — see lib/storage usage + docs/STORAGE.md.
export const STORAGE_BUCKETS = ['ticket-photos', 'completion-docs', 'quote-attachments'] as const

const OBJECT_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?]+)\/([^?]+)/

/**
 * Extract { bucket, path } from either a stored Supabase object URL
 * (…/object/public/<bucket>/<path>) or a raw "<bucket>/<path>" string.
 * Returns null if it isn't one of our buckets.
 */
export function bucketAndPath(stored: string): { bucket: string; path: string } | null {
  if (!stored) return null
  const m = stored.match(OBJECT_RE)
  if (m) return { bucket: m[1], path: decodeURIComponent(m[2]) }
  const slash = stored.indexOf('/')
  if (slash > 0) {
    const b = stored.slice(0, slash)
    if ((STORAGE_BUCKETS as readonly string[]).includes(b)) return { bucket: b, path: stored.slice(slash + 1) }
  }
  return null
}

/**
 * Server-only: turn a stored URL/path into a short-lived signed URL so a private
 * bucket object can be displayed. Falls back to the original string on any
 * failure so nothing hard-breaks during the public→private migration window.
 */
export async function signedUrl(stored: string | null | undefined, ttlSeconds = 3600): Promise<string | null> {
  if (!stored) return null
  const bp = bucketAndPath(stored)
  if (!bp) return stored
  try {
    const admin = createAdminClient()
    const { data } = await admin.storage.from(bp.bucket).createSignedUrl(bp.path, ttlSeconds)
    return data?.signedUrl ?? stored
  } catch {
    return stored
  }
}

/** Batch variant — signs a list, preserving order, dropping nulls. */
export async function signManyUrls(list: (string | null | undefined)[], ttlSeconds = 3600): Promise<string[]> {
  const out = await Promise.all(list.map(u => signedUrl(u, ttlSeconds)))
  return out.filter((u): u is string => !!u)
}
