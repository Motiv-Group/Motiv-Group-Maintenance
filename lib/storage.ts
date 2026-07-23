import { createAdminClient } from '@/lib/supabase/server'

// The private buckets. Reads must go through short-lived SIGNED URLs, not
// permanent public URLs — see lib/storage usage + docs/STORAGE.md.
export const STORAGE_BUCKETS = ['ticket-photos', 'ticket-docs', 'completion-docs', 'quote-attachments', 'project-files', 'supplier-docs'] as const

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

/** Server-only: download the RAW bytes of a private object (for bundling the
 *  original file into a ZIP). Returns null on any failure so one bad file can't
 *  break the whole export. */
export async function downloadStorageObject(stored: string | null | undefined): Promise<{ bytes: Buffer; contentType: string } | null> {
  const bp = bucketAndPath(stored ?? '')
  if (!bp) return null
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.storage.from(bp.bucket).download(bp.path)
    if (error || !data) return null
    return { bytes: Buffer.from(await data.arrayBuffer()), contentType: data.type || 'application/octet-stream' }
  } catch {
    return null
  }
}

/** The file extension (lowercase, no dot) from a stored path/URL, or 'bin'. */
export function extOf(stored: string): string {
  const bp = bucketAndPath(stored)
  const p = bp?.path ?? stored
  const m = p.match(/\.([a-z0-9]{1,5})(?:\?|$)/i)
  return m ? m[1].toLowerCase() : 'bin'
}

/** Batch variant — signs a list, preserving order, dropping nulls.
 *  Uses ONE createSignedUrls storage API call per bucket (instead of one round
 *  trip per file), which matters on detail pages signing 10-20 URLs. Falls back
 *  to the original string per item on any failure, matching signedUrl(). */
export async function signManyUrls(list: (string | null | undefined)[], ttlSeconds = 3600): Promise<string[]> {
  const items = list.filter((u): u is string => !!u)
  if (!items.length) return []

  // Group parseable items by bucket; unparseable strings pass through untouched.
  const byBucket = new Map<string, string[]>()
  const parsed = items.map(u => {
    const bp = bucketAndPath(u)
    if (bp) {
      const paths = byBucket.get(bp.bucket) ?? []
      if (!paths.includes(bp.path)) paths.push(bp.path)
      byBucket.set(bp.bucket, paths)
    }
    return { stored: u, bp }
  })

  // One API call per bucket; map path → signedUrl.
  const signedByBucketPath = new Map<string, string>()
  try {
    const admin = createAdminClient()
    await Promise.all([...byBucket.entries()].map(async ([bucket, paths]) => {
      const { data } = await admin.storage.from(bucket).createSignedUrls(paths, ttlSeconds)
      for (const row of data ?? []) {
        if (row.signedUrl && row.path) signedByBucketPath.set(`${bucket}/${row.path}`, row.signedUrl)
      }
    }))
  } catch {
    // Storage outage → fall through; every item returns its original string below.
  }

  return parsed.map(({ stored, bp }) =>
    bp ? (signedByBucketPath.get(`${bp.bucket}/${bp.path}`) ?? stored) : stored)
}
