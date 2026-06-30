'use client'

// A native <details> whose open/closed state is remembered (keyed by persistKey)
// across navigation and reloads until the next sign-in — see lib/collapse-state.
// Drop-in for server-rendered <details> groups: pass the same <summary> + body as
// children; the group-open CSS keeps working off the real `open` attribute.
import { useEffect, useState, type ReactNode } from 'react'
import { readCollapse, writeCollapse } from '@/lib/collapse-state'

export function PersistentDetails({ persistKey, defaultOpen = false, className, children }: {
  persistKey: string
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => { const v = readCollapse(persistKey); if (v !== null) setOpen(v) }, [persistKey])

  return (
    <details
      open={open}
      onToggle={e => { const v = (e.currentTarget as HTMLDetailsElement).open; setOpen(v); writeCollapse(persistKey, v) }}
      className={className}
    >
      {children}
    </details>
  )
}
