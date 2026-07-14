// Shared ticket Timeline — the vertical dot + connecting-line list used on the RM
// ticket detail, now also on the supplier detail so both read identically. Each
// event is a labelled row with an optional actor + timestamp; the newest (last)
// dot is highlighted blue. Pure/presentational.
import type { TimelineEvent } from '@/lib/ticket-timeline'
import { formatDateTime } from '@/lib/utils'

export function TicketTimeline({ items, emptyLabel = 'No history yet.' }: { items: TimelineEvent[]; emptyLabel?: string }) {
  if (!items.length) return <p className="text-sm text-[var(--text-faint)]">{emptyLabel}</p>
  return (
    <ol className="space-y-4">
      {items.map((e, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={`mt-1 h-2.5 w-2.5 rounded-full ${i === items.length - 1 ? 'bg-blue-500' : 'bg-[var(--text-faint)]'}`} />
            {i < items.length - 1 && <span className="mt-1 w-px flex-1 bg-[var(--border)]" />}
          </div>
          <div className="min-w-0 pb-1">
            <p className="text-sm font-medium text-[var(--text)]">{e.label}</p>
            <p className="text-[11px] text-[var(--text-faint)]">{e.who ? `${e.who} · ` : ''}{formatDateTime(e.at)}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
