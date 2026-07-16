import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

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
  // SEC-040: handled 500s must be visible in production, not just the ephemeral
  // Vercel logs. captureException no-ops when Sentry is unconfigured (dev/no DSN).
  Sentry.captureException(err)
  return NextResponse.json({ error: message }, { status: 500 })
}

// R100 000 000 sanity ceiling — a single maintenance quote above this is almost
// certainly a typo or an attack (e.g. Infinity/NaN slipping through `>0` checks).
export const MAX_MONEY_AMOUNT = 100_000_000

/**
 * Parse an untrusted money amount. Returns a finite value in (0, MAX_MONEY_AMOUNT],
 * or null if it's NaN/Infinity/negative/zero/over-cap. `Number('abc')` → NaN → null;
 * `Infinity` → null (the old `amount > 0` check let it through).
 */
export function parseAmount(raw: unknown): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0 || n > MAX_MONEY_AMOUNT) return null
  return n
}
