import { AlertTriangle } from 'lucide-react'
import { formatDateTime, humanizeDuration } from '@/lib/utils'

/**
 * Red callout for a breached SLA. Concise structure: a bold headline that states
 * HOW LATE it is ("SLA breached by 38 minutes"), then the single next action to
 * take, with the original due time kept as dim secondary metadata. Pure/
 * presentational — the caller decides when a ticket is breached and supplies the
 * action sentence + `nowMs` (so the "by X" figure stays consistent with the page).
 */
export function BreachReason({ action, dueAt, nowMs }: { action: string; dueAt: string | null; nowMs: number }) {
  const overdueMs = dueAt ? Math.max(0, nowMs - new Date(dueAt).getTime()) : 0
  return (
    <div className="rounded-2xl bg-red-500/10 ring-1 ring-red-500/40 p-4 space-y-1">
      <p className="flex items-center gap-1.5 text-sm font-bold text-red-700 dark:text-red-400">
        <AlertTriangle size={15} className="shrink-0" /> SLA breached{dueAt ? ` by ${humanizeDuration(overdueMs)}` : ''}
      </p>
      {action && <p className="text-sm text-[var(--text)]">{action}</p>}
      {dueAt && <p className="text-[11px] text-[var(--text-muted)]">Was due {formatDateTime(dueAt)}</p>}
    </div>
  )
}
