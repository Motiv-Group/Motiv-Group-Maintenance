'use client'

import { useEffect } from 'react'

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
      <p className="text-3xl">⚠️</p>
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">Failed to load page</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400">Please check your connection and try again.</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
      >
        Retry
      </button>
    </div>
  )
}
