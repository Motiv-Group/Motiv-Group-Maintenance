import { Badge } from '@/components/ui/Badge'
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/utils'
import { RecentTicketsStack, type RecentTicket } from '@/components/regional/RecentTicketsStack'
import type { TicketStatus } from '@/lib/types'

const STATUS_ORDER: TicketStatus[] = [
  'open', 'quoted', 'accepted', 'in_progress', 'variation_pending', 'variation_accepted',
  'pending_sign_off', 'snag', 'snag_in_progress', 'declined', 'completed', 'cancelled',
]

/**
 * Renders a set of tickets as one collapsible stacked deck per status, in
 * lifecycle order. Reuses RecentTicketsStack for the deck visual. Server
 * component — safe to render from a server page.
 */
export function StatusTicketDecks({
  tickets,
  variant,
  basePath,
}: {
  tickets: RecentTicket[]
  variant: 'regional' | 'supplier' | 'client'
  basePath: string
}) {
  const groups = new Map<string, RecentTicket[]>()
  for (const t of tickets) {
    if (!groups.has(t.status)) groups.set(t.status, [])
    groups.get(t.status)!.push(t)
  }

  const known = STATUS_ORDER.filter(s => groups.has(s))
  const extra = Array.from(groups.keys()).filter(s => !STATUS_ORDER.includes(s as TicketStatus))
  const ordered = [...known, ...extra]

  if (ordered.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No tickets found.</p>
  }

  return (
    <div className="space-y-5">
      {ordered.map(status => {
        const group = groups.get(status)!
        const label = STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status
        return (
          <section key={status}>
            <div className="flex items-center gap-2 mb-2">
              <Badge className={STATUS_COLORS[status as keyof typeof STATUS_COLORS]}>{label}</Badge>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {group.length} ticket{group.length !== 1 ? 's' : ''}
              </span>
            </div>
            <RecentTicketsStack
              tickets={group}
              variant={variant}
              basePath={basePath}
              countLabel={label}
            />
          </section>
        )
      })}
    </div>
  )
}
