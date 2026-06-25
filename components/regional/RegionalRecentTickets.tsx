'use client'

// RM dashboard "Recent Tickets" — last 7 days, collapsible (mirrors the SM card).
// Shows ticket title + store name/branch code + priority & status badges; the
// whole row links to the ticket overview.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { RegionalTicketRow } from '@/lib/health/data'
import { Card } from '@/components/exec/ui'
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
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function RegionalRecentTickets({ tickets }: { tickets: RegionalTicketRow[] }) {
  const [open, setOpen] = useState(true)
  const recent = useMemo(() => {
    const cutoff = Date.now() - WEEK_MS
    return tickets.filter(t => new Date(t.createdAt).getTime() >= cutoff)
  }, [tickets])

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <button onClick={() => setOpen(o => !o)} aria-expanded={open}
          className="flex items-center gap-2 min-w-0 -m-1 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-[var(--hover)] transition">
          <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
          <span className="text-sm font-bold text-[var(--text)]">Recent Tickets</span>
          <span className="text-[11px] font-medium text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5 whitespace-nowrap">Last 7 days · {recent.length}</span>
        </button>
        <Link href="/regional/tickets" className="text-xs font-medium text-[#C6A35D] hover:underline shrink-0">All</Link>
      </div>

      {open && (recent.length ? recent.map(t => {
        const cv = clientVisibleStatus(t.status as TicketStatus)
        return (
          <Link key={t.id} href={`/regional/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
            <div className="min-w-0">
              <p className="text-sm text-[var(--text)] truncate">{t.title}</p>
              <p className="text-[11px] text-[var(--text-faint)] truncate">{t.storeName}{t.branchCode ? ` · ${t.branchCode}` : ''} · {formatDateTime(t.createdAt)}</p>
            </div>
            <div className="grid grid-cols-[4.5rem_6rem] gap-1.5 shrink-0">
              <PriorityBadge priority={t.priority} className="w-full text-center" />
              {cv && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${TONE[cv]}`}>{WORD[cv]}</span>}
            </div>
          </Link>
        )
      }) : <p className="text-sm text-[var(--text-faint)]">No tickets in the last 7 days.</p>)}
    </Card>
  )
}
