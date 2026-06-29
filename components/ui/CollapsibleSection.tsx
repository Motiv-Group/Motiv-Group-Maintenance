'use client'

// A <details> collapsible card section. The most-recent-phase block opens by
// default (`defaultOpen`, decided server-side), while the rest stay collapsed.
// The user's manual expand/collapse is remembered (keyed by `id`) across pages
// and reloads until the next sign-in — see lib/collapse-state. Matches the Card.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { readCollapse, writeCollapse } from '@/lib/collapse-state'

export function CollapsibleSection({
  id,
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  /** Stable key for remembering this section's open state across pages. */
  id: string
  title: string
  defaultOpen?: boolean
  /** Small pill/count shown next to the title (e.g. number of items). */
  badge?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const ref = useRef<HTMLDetailsElement>(null)

  // After mount, apply the remembered choice (if any) — overrides the default.
  useEffect(() => {
    const stored = readCollapse(id)
    if (stored !== null && stored !== open) setOpen(stored)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function onToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    const v = e.currentTarget.open
    setOpen(v)
    writeCollapse(id, v)
  }

  return (
    <Card className="overflow-hidden">
      <details ref={ref} open={open} onToggle={onToggle} className="group">
        <summary className="flex items-center justify-between gap-2 px-5 py-4 cursor-pointer list-none hover:bg-[var(--hover)] transition">
          <span className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold text-[var(--text)]">{title}</h2>
            {badge}
          </span>
          <ChevronDown size={16} className="text-[var(--text-faint)] shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-5 pb-5 space-y-3">{children}</div>
      </details>
    </Card>
  )
}
