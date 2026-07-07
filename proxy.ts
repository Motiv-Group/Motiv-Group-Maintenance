import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Strict, nonce-based CSP (no 'unsafe-inline' on scripts). The nonce is generated
// per request here and set on the REQUEST header so Next applies it to its own
// scripts; the root layout reads it (x-nonce) for the inline theme script.
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production'
  return [
    "default-src 'self'",
    // 'strict-dynamic' + nonce: only nonce'd scripts (and what they load) run.
    // 'unsafe-eval' is dev-only (react-refresh); prod has neither unsafe-*.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Violation reporting → /api/csp-report. `report-to` is the modern directive
    // (paired with the Reporting-Endpoints header below); `report-uri` is kept for
    // browsers that only support the legacy form.
    'report-uri /api/csp-report',
    'report-to csp-endpoint',
  ].join('; ')
}

// v3 cutover: roles live in user_profiles (company-scoped identity).
// Next 16 renamed the `middleware` file convention to `proxy` — same behaviour,
// same per-request CSP-nonce logic; the file is proxy.ts and the export is `proxy`.
export async function proxy(request: NextRequest) {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
  const csp = buildCsp(nonce)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)

  const applyCsp = (res: NextResponse) => {
    res.headers.set('content-security-policy', csp)
    // Names the `csp-endpoint` group referenced by the CSP `report-to` directive.
    res.headers.set('reporting-endpoints', 'csp-endpoint="/api/csp-report"')
    return res
  }

  const path = request.nextUrl.pathname
  const authPrefixes = ['/client', '/regional', '/supplier', '/executive', '/individual', '/admin', '/settings', '/auth']
  const needsAuth = authPrefixes.some(p => path.startsWith(p))

  // Public pages (/, /privacy, /terms, …): apply CSP, skip the auth round-trip.
  if (!needsAuth) {
    return applyCsp(NextResponse.next({ request: { headers: requestHeaders } }))
  }

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  async function getRole(): Promise<string | null> {
    if (!user) return null
    const { data } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
    return data?.role ?? null
  }

  const gate = async (allowed: string[]) => {
    if (!user) return NextResponse.redirect(new URL('/auth/login', request.url))
    const role = await getRole()
    if (!role || !allowed.includes(role)) return NextResponse.redirect(new URL('/auth/login', request.url))
    return null
  }

  if (path.startsWith('/client'))     { const r = await gate(['store_manager']); if (r) return r }
  if (path.startsWith('/regional'))   { const r = await gate(['regional_manager']); if (r) return r }
  if (path.startsWith('/supplier'))   { const r = await gate(['supplier']); if (r) return r }
  if (path.startsWith('/executive'))  { const r = await gate(['executive', 'system_admin']); if (r) return r }
  if (path.startsWith('/individual')) { const r = await gate(['individual']); if (r) return r }
  if (path.startsWith('/admin'))      { const r = await gate(['system_admin']); if (r) return r }
  if (path.startsWith('/settings'))  { if (!user) return NextResponse.redirect(new URL('/auth/login', request.url)) }

  if (user && (path === '/auth/login' || path === '/auth/signup')) {
    const role = await getRole()
    const dest = role === 'supplier' ? '/supplier'
      : role === 'regional_manager' ? '/regional'
      : role === 'system_admin' ? '/admin'
      : role === 'executive' ? '/executive'
      : role === 'individual' ? '/individual'
      : '/client'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  return applyCsp(supabaseResponse)
}

export const config = {
  // Run on every route EXCEPT api, next internals, and static files (anything with a dot).
  matcher: ['/((?!api|_next|.*\\..*).*)'],
}
