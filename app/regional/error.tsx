'use client'

import { useEffect } from 'react'

export default function RegionalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
      <p className="text-3xl">⚠️</p>
      <h2 className="text-base font-semibold text-[var(--text)]">Failed to load page</h2>
      <p className="text-sm text-[var(--text-muted)]">Please check your connection and try again.</p>
      <button
        type="button"
        onClick={reset}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        Retry
      </button>
    </div>
  )
}
