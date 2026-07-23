import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// Browser extensions (password managers, translators, ad-blockers) inject their own
// frames/scripts into every page; the page CSP blocks + reports them, but that's the
// EXTENSION breaking, not our policy — so these are noise and must not flood Sentry.
// Opaque/inline origins ('inline', 'eval', 'about', data:/blob:) are likewise not an
// actionable host. Real host violations (https://…) still forward. Kept in console.
function isNoiseBlocked(blocked: string): boolean {
  const b = blocked.toLowerCase().trim()
  if (!b) return true
  if (/^(chrome|moz|safari|safari-web|ms-browser)-extension:/.test(b)) return true
  if (b.startsWith('webkit-masked-url:')) return true
  if (['inline', 'eval', 'about', 'about:blank', 'data', 'blob'].includes(b)) return true
  return false
}

// Host of a blocked URL for Sentry grouping ("challenges.cloudflare.com"); the raw
// string when it isn't a URL. Lets one real offending host be its own issue instead
// of every frame-src report collapsing into a single uninformative bucket.
function hostOf(blocked: string): string {
  try { return new URL(blocked).host || blocked } catch { return blocked }
}

// CSP violation reports the browser POSTs here (via the CSP report-to/report-uri
// directives set in proxy.ts). Unauthenticated by design — browsers send reports
// without a session. We surface each violation to Sentry (and Vercel logs) so a
// real policy break is visible, and rate-limit hard because one bad directive can
// fire a burst of reports per page load (protects the endpoint + the Sentry quota).
//
// Two wire formats: the legacy `report-uri` posts `{ "csp-report": {...} }`
// (content-type application/csp-report); the modern `report-to` posts an array of
// `{ type: 'csp-violation', body: {...} }` (application/reports+json). Handle both.
export async function POST(request: Request) {
  // SEC-044: key the limit per client IP (a global key lets one noisy client
  // exhaust the whole quota / suppress everyone else's reports).
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  if (!(await rateLimit(`csp-report:${ip}`, 30, 60_000))) return new NextResponse(null, { status: 429 })

  let payload: unknown = null
  try { payload = await request.json() } catch { return new NextResponse(null, { status: 204 }) }

  // The wire payload is attacker-controllable JSON — treat every field as unknown.
  const rec = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' ? (v as Record<string, unknown>) : null

  const reports: unknown[] = Array.isArray(payload)
    ? payload.filter((r) => rec(r)?.type === 'csp-violation').map((r) => rec(r)?.body)
    : [rec(payload)?.['csp-report'] ?? payload]

  for (const raw of reports) {
    const r = rec(raw)
    if (!r) continue
    // Field names differ between the two formats; accept either.
    const directive = r.effectiveDirective || r['violated-directive'] || r.violatedDirective || 'unknown'
    const blocked = r.blockedURL || r['blocked-uri'] || r.blockedUri || ''
    const doc = r.documentURL || r['document-uri'] || r.documentUri || ''
    console.warn('[csp-report]', directive, '| blocked:', blocked, '| doc:', doc)
    // Extension / opaque-origin reports are noise (not our policy breaking) — log
    // them but never forward, so they can't drown out a real break or burn quota.
    if (isNoiseBlocked(String(blocked))) continue
    // SEC-044: only forward the whitelisted, non-sensitive fields — never the raw
    // attacker-controllable report object. Fingerprint by directive + blocked host
    // so distinct offending hosts are distinct Sentry issues (not one bucket).
    const host = hostOf(String(blocked))
    Sentry.captureMessage(`CSP violation: ${directive} → ${host}`, {
      level: 'warning',
      tags: { csp_directive: String(directive), csp_blocked_host: host },
      fingerprint: ['csp-violation', String(directive), host],
      extra: { blocked: String(blocked).slice(0, 500), doc: String(doc).slice(0, 500) },
    })
  }

  // 204: the browser doesn't need a body for a report POST.
  return new NextResponse(null, { status: 204 })
}
