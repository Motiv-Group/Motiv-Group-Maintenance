import { AlertTriangle } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

/**
 * Red banner explaining WHY a ticket's SLA is breached — the pending action that
 * ran past its deadline, when it was due, and who it's waiting on. Pure/
 * presentational; the caller decides when a ticket is breached.
 */
export function BreachReason({ nextAction, dueAt, owner }: { nextAction: string; dueAt: string | null; owner: string }) {
  return (
    <div className="rounded-2xl bg-red-500/10 ring-1 ring-red-500/40 p-4 space-y-0.5">
      <p className="flex items-center gap-1.5 text-sm font-bold text-red-700 dark:text-red-400"><AlertTriangle size={15} /> SLA breached</p>
      <p className="text-sm text-[var(--text)]">{nextAction} is overdue{dueAt ? ` — was due ${formatDateTime(dueAt)}` : ''}.</p>
      <p className="text-[11px] text-[var(--text-muted)]">Waiting on: {owner}</p>
    </div>
  )
}
