'use client'

import { useEffect } from 'react'

// Catches errors thrown in the ROOT layout itself (which app/error.tsx cannot,
// since that boundary renders *inside* the root layout). This replaces the whole
// document, so it must render its own <html>/<body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html>
      <body className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
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
      </body>
    </html>
  )
}
