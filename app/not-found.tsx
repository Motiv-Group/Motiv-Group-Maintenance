import Link from 'next/link'

// Root 404 boundary. Renders inside the root layout — no <html>/<body> here.
export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <p className="text-4xl">🔍</p>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Page not found</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
