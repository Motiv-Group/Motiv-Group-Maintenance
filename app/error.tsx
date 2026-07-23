'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { reloadIfChunkError } from '@/lib/chunk-reload'

// Route-segment error boundary. Renders INSIDE the root layout, so it must NOT
// render its own <html>/<body> — the layout already provides them. Errors in the
// root layout itself are caught by app/global-error.tsx instead.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Stale-chunk errors after a deploy: reload once to fetch fresh chunks instead
    // of showing an error page. Skip reporting those (they're transient, not a bug).
    if (reloadIfChunkError(error)) return
    // Client render errors aren't covered by onRequestError — report explicitly
    // (no-ops when the DSN is unset).
    Sentry.captureException(error)
    console.error(error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <p className="text-4xl">⚠️</p>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Something went wrong</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">An unexpected error occurred.</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
