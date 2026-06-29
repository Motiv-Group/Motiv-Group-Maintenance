// A native <details> collapsible card section. No JS — the `open` attribute is
// set server-side so the most-recent-phase block can be opened by default while
// the rest stay collapsed. Matches the look of the shared Card.
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card } from '@/components/exec/ui'

export function CollapsibleSection({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string
  defaultOpen?: boolean
  /** Small pill/count shown next to the title (e.g. number of items). */
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="overflow-hidden">
      <details open={defaultOpen} className="group">
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
