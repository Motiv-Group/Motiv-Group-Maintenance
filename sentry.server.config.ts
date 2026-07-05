import * as Sentry from '@sentry/nextjs'

// No-op when NEXT_PUBLIC_SENTRY_DSN is unset (enabled:false), so this is safe to
// ship before a Sentry project exists — add the DSN env var to switch it on.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
})
