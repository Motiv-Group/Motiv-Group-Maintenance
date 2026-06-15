import Link from 'next/link'
import { TicketContent, type RecentTicket } from '@/components/regional/RecentTicketsStack'

type Variant = 'regional' | 'supplier' | 'client'

/**
 * Plain vertical list of ticket cards (no stacked-deck visual). Used for the
 * archive on the ticket pages, where completed tickets read better as a list.
 * Shares TicketContent with RecentTicketsStack so cards look identical.
 */
export function TicketList({
  tickets,
  variant,
  basePath,
}: {
  tickets: RecentTicket[]
  variant: Variant
  basePath: string
}) {
  if (tickets.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No tickets found.</p>
  }

  return (
    <div className="space-y-2 p-2">
      {tickets.map(ticket => (
        <Link key={ticket.id} href={`${basePath}/${ticket.id}`}>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-brand-400 dark:hover:border-gray-500 transition-colors">
            <TicketContent ticket={ticket} variant={variant} />
          </div>
        </Link>
      ))}
    </div>
  )
}
