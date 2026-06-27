import { formatDateTime, humanizeDuration } from '@/lib/utils'

/**
 * "Due" field for a ticket detail block — the ticket's final resolution
 * deadline. When the ticket is overdue (active and past due) the date turns red
 * and a "Overdue by Xd Yh" line is shown. Pure/presentational: safe in server
 * and client components. Pass `now` (ISO) on the server for SSR-stable output.
 */
export function DueDate({ dueAt, overdue, now, showOverdueText = true }: { dueAt: string; overdue: boolean; now?: string; showOverdueText?: boolean }) {
  const ref = now ? new Date(now).getTime() : Date.now()
  const overdueMs = ref - new Date(dueAt).getTime()
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Due</div>
      <div className={`text-sm mt-0.5 ${overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-[var(--text)]'}`}>{formatDateTime(dueAt)}</div>
      {overdue && showOverdueText && <div className="text-[11px] font-semibold text-red-600 dark:text-red-400 mt-0.5">Overdue by {humanizeDuration(Math.max(0, overdueMs))}</div>}
    </div>
  )
}
