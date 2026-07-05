import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { signedUrl } from '@/lib/storage'

export const dynamic = 'force-dynamic'

/**
 * POST /api/files/sign  { paths: string[] } -> { urls: (string|null)[] }
 *
 * Mints short-lived signed URLs for client components that only have a stored
 * object URL/path (private buckets can't be read via a plain <img src>). Auth-gated.
 *
 * NOTE: this authorises "is a logged-in user", not "may this user see THIS file"
 * — per-file ownership (path -> ticket -> company) is a follow-up. It still closes
 * the main hole (unauthenticated, permanent public access).
 */
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`files-sign:${user.id}`, 120, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { paths } = await request.json().catch(() => ({ paths: [] }))
  if (!Array.isArray(paths)) return NextResponse.json({ error: 'paths[] required' }, { status: 400 })

  const urls = await Promise.all(paths.slice(0, 30).map((p: unknown) => signedUrl(typeof p === 'string' ? p : null)))
  return NextResponse.json({ urls })
}
