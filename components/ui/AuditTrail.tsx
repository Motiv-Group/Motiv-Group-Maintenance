import { History, ChevronDown } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { buildTicketTimeline, type TimelineInput, type TimelineTone } from '@/lib/ticket-timeline'

// Dot colour per event tone — reuses the app's status palette so the trail reads
// at a glance (cyan/violet = quoting, emerald = approved/done, red = declined/snag).
const DOT_TONE: Record<TimelineTone, string> = {
  logged: 'bg-blue-500', info_requested: 'bg-amber-500', info_added: 'bg-teal-500',
  quote_requested: 'bg-cyan-500', quote_submitted: 'bg-violet-500',
  quote_approved: 'bg-emerald-500', quote_declined: 'bg-red-500', scheduled: 'bg-indigo-500',
  completion_submitted: 'bg-[#f59e0b]', completion_approved: 'bg-emerald-500', completion_rejected: 'bg-red-500',
  completed: 'bg-emerald-500', cancelled: 'bg-red-500', edited: 'bg-slate-400', update: 'bg-[#f59e0b]',
  viewed: 'bg-slate-400',
  variation: 'bg-purple-500', variation_approved: 'bg-emerald-500', variation_declined: 'bg-red-500',
}

/** Collapsible event timeline for a ticket — the full life in date order with who
 *  acted. Server-safe (zero-JS via <details>). Collapsed by default. */
export function AuditTrail({ ticket }: { ticket: TimelineInput }) {
  const items = buildTicketTimeline(ticket)
  return (
    <details className="group rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)] dark:ring-white/10 shadow-sm dark:shadow-md dark:shadow-black/20 overflow-hidden">
      <summary className="flex items-center justify-between gap-2 px-5 py-4 cursor-pointer list-none hover:bg-[var(--hover)] transition">
        <span className="flex items-center gap-2 text-sm font-bold text-[var(--text)]"><History size={15} className="text-[var(--text-muted)]" /> View audit trail</span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-faint)]">{items.length} event{items.length === 1 ? '' : 's'}</span>
          <ChevronDown size={16} className="text-[var(--text-faint)] transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-[var(--border)] px-5 py-4">
        {items.length ? (
          <ol className="relative ml-1.5 space-y-4 border-l border-[var(--border)]">
            {items.map((u, i) => (
              <li key={i} className="ml-4">
                <span className={`absolute -left-[5px] mt-1 w-2.5 h-2.5 rounded-full ring-2 ring-[var(--surface)] ${DOT_TONE[u.tone] ?? 'bg-[#f59e0b]'}`} />
                <p className="text-sm text-[var(--text)]">{u.label}</p>
                <p className="text-[11px] text-[var(--text-faint)]">{u.who ? `${u.who} · ` : ''}{formatDateTime(u.at)}</p>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-[var(--text-faint)]">No events yet.</p>}
      </div>
    </details>
  )
}
