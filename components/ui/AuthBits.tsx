import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

/** Inline auth error: small warning icon + concise message. */
export function AuthError({ message }: { message: string }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
      <span>{message}</span>
    </div>
  )
}

/** Legal footer shared across the auth pages — clearer contrast + separator. */
export function AuthFooter() {
  return (
    <p className="mt-6 text-center text-xs text-gray-400">
      <Link href="/privacy" className="transition-colors hover:text-white hover:underline">Privacy Policy</Link>
      <span className="px-1.5 text-gray-600">·</span>
      <Link href="/terms" className="transition-colors hover:text-white hover:underline">Terms of Service</Link>
    </p>
  )
}
