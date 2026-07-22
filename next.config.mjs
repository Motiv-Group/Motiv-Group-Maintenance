import { withSentryConfig } from '@sentry/nextjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: projectRoot,
  // @react-pdf/renderer ships wasm (yoga-layout) + font/trie assets that Next's
  // bundler drops when it inlines the package — which breaks PDF generation in the
  // serverless function (works locally where node_modules resolves normally). Keep
  // it external so it loads from node_modules at runtime. (sharp is auto-external.)
  serverExternalPackages: ['@react-pdf/renderer'],
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    // Next 14.2 reuses a dynamic page's client render for 30s on back-navigation,
    // so reopening a ticket (open → dashboard → reopen) served the STALE first
    // render — the server never re-ran, so per-visit state like the RM "new vs seen
    // supplier updates" watermark never re-evaluated. 0 = always refetch fresh on
    // navigation, which suits this force-dynamic + realtime app.
    staleTimes: { dynamic: 0 },
    // (instrumentationHook removed — instrumentation.ts is stable in Next 16, no flag needed.)
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
    // Static security headers. The CSP is set PER-REQUEST in proxy.ts (it needs
    // a per-request nonce for the strict, no-'unsafe-inline' script policy), so it is
    // intentionally NOT here — two CSP headers would conflict.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
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
