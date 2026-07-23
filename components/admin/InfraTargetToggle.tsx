'use client'

// Segmented control for the infra tabs that switch data source (Vercel: prod app
// vs marketing website; Supabase: prod vs dev DB). Drives a ?target= search param;
// the server page re-reads it (both pages are force-dynamic).
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

export function InfraTargetToggle({ param = 'target', options, current }: {
  param?: string
  options: { key: string; label: string }[]
  current: string
}) {
  const pathname = usePathname()
  const sp = useSearchParams()
  return (
    <div className="inline-flex rounded-xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-1">
      {options.map(o => {
        const active = o.key === current
        const q = new URLSearchParams(sp.toString())
        q.set(param, o.key)
        return (
          <Link
            key={o.key}
            href={`${pathname}?${q.toString()}`}
            aria-current={active ? 'true' : undefined}
            className={`inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold transition ${
              active ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {o.label}
          </Link>
        )
      })}
    </div>
  )
}
