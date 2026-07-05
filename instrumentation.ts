// Next.js instrumentation hook — loads the Sentry SDK for the matching runtime.
// Requires experimental.instrumentationHook in next.config.mjs on Next 14.2.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs'
