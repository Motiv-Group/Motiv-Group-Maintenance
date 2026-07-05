import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Next 14.2 reuses a dynamic page's client render for 30s on back-navigation,
    // so reopening a ticket (open → dashboard → reopen) served the STALE first
    // render — the server never re-ran, so per-visit state like the RM "new vs seen
    // supplier updates" watermark never re-evaluated. 0 = always refetch fresh on
    // navigation, which suits this force-dynamic + realtime app.
    staleTimes: { dynamic: 0 },
    // Required on Next 14.2 for instrumentation.ts (Sentry) to load.
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    // CSP is shipped Report-Only for now: the app relies on inline theme/splash
    // scripts (app/layout.tsx), Supabase REST + realtime (wss), and pdfjs blob
    // workers, so an *enforced* policy needs live testing against the browser AND
    // the Capacitor WebView first. Report-Only surfaces violations without breaking
    // anything — tighten to `Content-Security-Policy` once the report is clean.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy-Report-Only', value: csp },
        ],
      },
    ]
  },
}

// Source-map upload only runs when SENTRY_AUTH_TOKEN/org/project are set, so this
// wrap is a no-op in CI/local without those. silent avoids build-log noise.
export default withSentryConfig(nextConfig, {
  silent: true,
})
