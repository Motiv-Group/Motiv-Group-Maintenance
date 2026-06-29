'use client'

// RM dashboard "Recent Tickets" — 5 most recent, collapsible (mirrors the SM card).
// Shows ticket title + store name/branch code + priority & status badges; the
// whole row links to the ticket overview.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { RegionalTicketRow } from '@/lib/health/data'
import { Card } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { rmStatusMeta, formatDateTime, humanizeDuration } from '@/lib/utils'

const MAX_RECENT = 5

export function RegionalRecentTickets({ tickets }: { tickets: RegionalTicketRow[] }) {
  const [open, setOpen] = useState(true)
  const recent = useMemo(() => {
    // Completed tickets live in the Tickets-tab archive, not the recent overview.
    return tickets
      .filter(t => t.status !== 'completed')
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, MAX_RECENT)
  }, [tickets])

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <button onClick={() => setOpen(o => !o)} aria-expanded={open}
          className="flex items-center gap-2 min-w-0 -m-1 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-[var(--hover)] transition">
          <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
          <span className="text-sm font-bold text-[var(--text)]">Recent Tickets</span>
          <span className="text-[11px] font-medium text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5 whitespace-nowrap">Latest {recent.length}</span>
        </button>
        <Link href="/regional/tickets" className="text-xs font-medium text-[#C6A35D] hover:underline shrink-0">All</Link>
      </div>

      {open && (recent.length ? recent.map(t => {
        const sm = rmStatusMeta(t.status)
        return (
          <Link key={t.id} href={`/regional/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
            <div className="min-w-0">
              <p className="text-sm text-[var(--text)] truncate">{t.title}</p>
              <p className="text-[11px] text-[var(--text-faint)] truncate">{t.storeName}{t.branchCode ? ` · ${t.branchCode}` : ''} · {formatDateTime(t.createdAt)}</p>
              {t.overdue && <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">Overdue by {humanizeDuration(Date.now() - new Date(t.dueAt).getTime())}</p>}
              {(() => {
                const m = t.quoteAcceptedAt ? { l: 'Quote accepted', at: t.quoteAcceptedAt }
                  : t.quoteReceivedAt ? { l: 'Quoted', at: t.quoteReceivedAt }
                  : t.quoteRequestedAt ? { l: 'Quote requested', at: t.quoteRequestedAt } : null
                return m ? <p className={`text-[11px] font-medium truncate ${sm.text}`}>{m.l} · {formatDateTime(m.at)}</p> : null
              })()}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_7rem] gap-1.5 shrink-0 justify-items-end sm:justify-items-stretch">
              <PriorityBadge priority={t.priority} className="w-full text-center" />
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${t.infoAdded ? 'bg-teal-500/15 text-teal-700 dark:text-teal-400' : sm.cls}`}>{t.infoAdded ? 'Info added' : sm.label}</span>
            </div>
          </Link>
        )
      }) : <p className="text-sm text-[var(--text-faint)]">No recent tickets.</p>)}
    </Card>
  )
}
