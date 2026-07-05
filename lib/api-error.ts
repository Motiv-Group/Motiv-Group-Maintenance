import { NextResponse } from 'next/server'

/**
 * Log the real error server-side and return a GENERIC 500 to the client.
 *
 * API routes must never echo a raw Supabase/Postgres `error.message` back to the
 * browser — those strings leak table/column/constraint names and internal SQL,
 * which aids enumeration. Use this for unexpected/internal failures. Curated,
 * user-facing 4xx messages (e.g. "Branch code already exists") are fine to keep
 * inline; this helper is only for the 500 path.
 */
export function serverError(err: unknown, message = 'Something went wrong'): NextResponse {
  console.error('[api]', err)
  return NextResponse.json({ error: message }, { status: 500 })
}
