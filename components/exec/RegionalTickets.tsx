// RM Tickets tab — grouped by store, each row shows the ticket title + priority
// & status badges, and the whole row links to the ticket overview.
import Link from 'next/link'
import { Ticket } from 'lucide-react'
import type { RegionalTicketRow } from '@/lib/health/data'
import { SectionCard } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { clientVisibleStatus, formatDateTime } from '@/lib/utils'
import type { TicketStatus } from '@/lib/types'

const TONE: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  in_progress: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D]',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  cancelled: 'bg-gray-500/15 text-gray-600 dark:text-gray-400',
}
const WORD: Record<string, string> = { open: 'Open', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }

export function RegionalTickets({ tickets }: { tickets: RegionalTicketRow[] }) {
  // Group by store (carrying the branch code), stores sorted alphabetically.
  const groups = new Map<string, { branchCode: string | null; rows: RegionalTicketRow[] }>()
  for (const t of tickets) {
    const g = groups.get(t.storeName) ?? { branchCode: t.branchCode, rows: [] }
    g.rows.push(t)
    groups.set(t.storeName, g)
  }
  const sorted = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Ticket className="text-blue-600 dark:text-blue-400" size={22} /> Tickets</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">All tickets in your region, grouped by store.</p>
      </div>

      {sorted.length === 0 && <SectionCard title="Tickets"><p className="text-sm text-[var(--text-faint)]">No tickets yet.</p></SectionCard>}

      {sorted.map(([store, g]) => (
        <SectionCard key={store} title={`${store}${g.branchCode ? ` · ${g.branchCode}` : ''} (${g.rows.length})`}>
          {g.rows.map(t => {
            const cv = clientVisibleStatus(t.status as TicketStatus)
            return (
              <Link key={t.id} href={`/regional/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2.5 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
                <div className="min-w-0">
                  {t.jobRef && <p className="text-[10px] font-mono text-[var(--text-faint)]">{t.jobRef}</p>}
                  <p className="text-sm text-[var(--text)] truncate">{t.title}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(t.createdAt)}</p>
                </div>
                <div className="grid grid-cols-[4.5rem_6rem] gap-1.5 shrink-0">
                  <PriorityBadge priority={t.priority} className="w-full text-center" />
                  {cv && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${TONE[cv]}`}>{WORD[cv]}</span>}
                </div>
              </Link>
            )
          })}
        </SectionCard>
      ))}
    </div>
  )
}
