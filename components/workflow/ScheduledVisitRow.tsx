// Prominent "Scheduled visit" callout shown inside the accepted/awarded quote on
// the RM and supplier ticket pages, so the date the supplier committed to stands
// out next to the commercial detail. Pure/server-safe.
import { CalendarClock } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

export function ScheduledVisitRow({ scheduledAt, proposed = false, technician = null, audience = 'rm' }: {
  scheduledAt: string
  proposed?: boolean
  technician?: string | null
  audience?: 'rm' | 'supplier'
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/40 px-4 py-3">
      <span className="grid place-items-center w-10 h-10 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/30 shrink-0">
        <CalendarClock size={20} className="text-indigo-600 dark:text-indigo-400" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide font-semibold text-indigo-700 dark:text-indigo-400">Scheduled visit{proposed ? ' · proposed' : ''}</p>
        <p className="text-base font-bold text-[var(--text)]">{formatDateTime(scheduledAt)}{technician ? ` · ${technician}` : ''}</p>
        {proposed && <p className="text-[11px] text-amber-600 dark:text-amber-400">{`Past the SLA window — awaiting ${audience === 'supplier' ? 'the manager’s' : 'your'} acceptance.`}</p>}
      </div>
    </div>
  )
}
