// Shared ticket visuals for the store-manager side: the round category icon and
// the matched priority + client-status badges. Used by both the dashboard work
// queue and the Tickets tab so they look identical (same size).
import { categoryVisual } from '@/lib/categoryVisual'
import { PRIORITY_LEVEL_LABELS } from '@/lib/utils'
import type { StoreManagerTicket } from '@/lib/health/data'

// Category-icon chip: the GLYPH comes from the category, but the COLOUR follows
// the ticket's PRIORITY (urgent=red, high=orange, medium=amber, low=slate) when a
// priority is given — so a row's icon reads its urgency at a glance. Falls back to
// the category colour when no priority is passed.
function priorityChip(priority?: string | null): string | null {
  if (!priority) return null
  const p = String(priority)
  if (p === 'urgent' || p === 'P1') return 'bg-red-500/15 text-red-600 dark:text-red-400'
  if (p === 'high' || p === 'P2') return 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
  if (p === 'medium' || p === 'P3') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  if (p === 'low' || p === 'P4') return 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
  return null
}

export function CategoryIcon({ category, priority, className = 'h-14 w-14', iconSize = 22 }: { category?: string | null; priority?: string | null; className?: string; iconSize?: number }) {
  const { Icon, badgeClass } = categoryVisual(category)
  const chip = priorityChip(priority) ?? badgeClass
  return <span className={`grid shrink-0 place-items-center rounded-full ${className} ${chip}`}><Icon size={iconSize} /></span>
}

export function priorityLabel(ticket: StoreManagerTicket): string {
  return PRIORITY_LEVEL_LABELS[String(ticket.priority)] ?? 'Medium'
}

export function priorityBadgeClass(ticket: StoreManagerTicket): string {
  const p = String(ticket.priority)
  if (p === 'urgent' || p === 'P1') return 'bg-red-500/15 text-red-600 dark:text-red-400'
  if (p === 'high' || p === 'P2') return 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
  if (p === 'medium' || p === 'P3') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  return 'bg-slate-500/15 text-slate-600 dark:text-slate-300' // low / P4
}

export function clientStatusLabel(ticket: StoreManagerTicket): string {
  if (ticket.infoAdded) return 'Info added'
  switch (ticket.status) {
    case 'open':           return 'New'
    case 'info_requested': return 'Input needed'
    case 'scheduled':      return 'Scheduled'
    case 'in_progress':    return 'In progress'
    case 'completed':      return 'Completed'
    case 'cancelled':      return 'Cancelled'
    default:               return String(ticket.status).replace(/_/g, ' ')
  }
}

export function clientStatusBadgeClass(ticket: StoreManagerTicket): string {
  // 4-tone status language (mirrors rmStatusMeta): amber = your input is needed,
  // blue = new / in-flight, green = completed, grey = cancelled/declined.
  if (ticket.infoAdded || ticket.status === 'info_requested') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  switch (ticket.status) {
    case 'completed':   return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
    case 'cancelled':   return 'bg-gray-500/15 text-gray-600 dark:text-gray-400'
    default:            return 'bg-blue-500/15 text-blue-700 dark:text-blue-400' // open / scheduled / in progress / New
  }
}

// Priority + status badges, sized identically (fixed width so both align
// regardless of label length — e.g. "Low" and "Input needed" render same size).
export function TicketBadges({ ticket, className = '' }: { ticket: StoreManagerTicket; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className={`inline-flex w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${priorityBadgeClass(ticket)}`}>{priorityLabel(ticket)}</span>
      <span className={`inline-flex w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${clientStatusBadgeClass(ticket)}`}>{clientStatusLabel(ticket)}</span>
    </div>
  )
}
