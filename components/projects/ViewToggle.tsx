'use client'

import type { LucideIcon } from 'lucide-react'

/**
 * Shared list/tile (or cards/table) view switch used across the project screens.
 * Mobile-first: always visible with ≥40px touch targets (the old inline version
 * in RegionalProjectDashboard was `hidden sm:flex`, so phones never got it).
 * Active = blue per the app's interactive-action convention.
 */
export function ViewToggle<T extends string>({ value, onChange, options, className = '' }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; icon: LucideIcon; label: string }[]
  className?: string
}) {
  return (
    <div className={`inline-flex shrink-0 overflow-hidden rounded-lg ring-1 ring-[var(--border)] ${className}`} role="group">
      {options.map((o) => {
        const Icon = o.icon
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            aria-label={o.label}
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`flex min-h-[40px] min-w-[40px] items-center justify-center px-2.5 sm:min-h-0 sm:min-w-0 sm:p-2 ${active ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)] hover:bg-[var(--hover)]'}`}
          >
            <Icon size={16} />
          </button>
        )
      })}
    </div>
  )
}
