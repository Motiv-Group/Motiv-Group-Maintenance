// Sentry — client (browser). Next's modern convention (replaces sentry.client.config.ts).
// DSN comes from NEXT_PUBLIC_SENTRY_DSN (set in .env.local + Vercel); no-ops when unset.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
