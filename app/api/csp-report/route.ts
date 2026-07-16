import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

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

  const reports: any[] = Array.isArray(payload)
    ? payload.filter((r) => r && r.type === 'csp-violation').map((r) => r.body)
    : [(payload as any)?.['csp-report'] ?? payload]

  for (const r of reports) {
    if (!r || typeof r !== 'object') continue
    // Field names differ between the two formats; accept either.
    const directive = r.effectiveDirective || r['violated-directive'] || r.violatedDirective || 'unknown'
    const blocked = r.blockedURL || r['blocked-uri'] || r.blockedUri || ''
    const doc = r.documentURL || r['document-uri'] || r.documentUri || ''
    console.warn('[csp-report]', directive, '| blocked:', blocked, '| doc:', doc)
    // SEC-044: only forward the whitelisted, non-sensitive fields — never the raw
    // attacker-controllable report object.
    Sentry.captureMessage(`CSP violation: ${directive}`, {
      level: 'warning',
      tags: { csp_directive: String(directive) },
      extra: { blocked: String(blocked).slice(0, 500), doc: String(doc).slice(0, 500) },
    })
  }

  // 204: the browser doesn't need a body for a report POST.
  return new NextResponse(null, { status: 204 })
}
