'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

/**
 * Inline "back" control that returns to the previous page the user was on
 * (browser history). On a cold/direct load with no in-app history it falls back
 * to a sensible fixed destination so the button never dead-ends.
 */
export function BackLink({ fallbackHref, label = 'Back', className }: { fallbackHref: string; label?: string; className?: string }) {
  const router = useRouter()
  const onClick = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push(fallbackHref)
  }
  return (
    <button onClick={onClick} className={className ?? 'inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]'}>
      <ArrowLeft size={15} /> {label}
    </button>
  )
}
