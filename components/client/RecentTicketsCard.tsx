'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { StoreManagerTicket } from '@/lib/health/data'
import { Card } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { readCollapse, writeCollapse } from '@/lib/collapse-state'
import { formatDateTime, humanizeDuration } from '@/lib/utils'

const STATUS_TONE: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  info_requested: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  in_progress: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D]',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  cancelled: 'bg-gray-500/15 text-gray-600 dark:text-gray-400',
}
const STATUS_WORD: Record<string, string> = { open: 'Open', info_requested: 'Info Requested', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Store-manager dashboard "Recent Tickets" — last 7 days only, collapsible. */
export function RecentTicketsCard({ tickets }: { tickets: StoreManagerTicket[] }) {
  const [open, setOpen] = useState(false)
  // Remember the expand/collapse choice across navigation (wiped on next sign-in).
  useEffect(() => { const v = readCollapse('sm-recent-open'); if (v !== null) setOpen(v) }, [])
  const toggle = () => setOpen(o => { const v = !o; writeCollapse('sm-recent-open', v); return v })
  const recent = useMemo(() => {
    const cutoff = Date.now() - WEEK_MS
    // Completed tickets live in the Tickets-tab archive, not the dashboard overview.
    return tickets.filter(t => t.status !== 'completed' && new Date(t.createdAt).getTime() >= cutoff)
  }, [tickets])

  return (
    <Card className="p-5 cursor-pointer hover:ring-[#C6A35D]/30 transition" onClick={toggle} role="button" tabIndex={0} aria-expanded={open}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="flex items-center gap-2 min-w-0">
          <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
          <span className="text-sm font-bold text-[var(--text)]">Recent Tickets</span>
          <span className="text-[11px] font-medium text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5 whitespace-nowrap">Last 7 days · {recent.length}</span>
        </span>
        <Link href="/client/tickets" onClick={e => e.stopPropagation()} className="text-xs font-medium text-[#C6A35D] hover:underline shrink-0">All</Link>
      </div>

      {open && (recent.length ? <div onClick={e => e.stopPropagation()}>{recent.map(t => (
        <Link key={t.id} href={`/client/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
          <div className="min-w-0">
            {t.jobRef && <p className="text-[10px] font-mono text-[var(--text-faint)]">{t.jobRef}</p>}
            <p className="text-sm text-[var(--text)] truncate">{t.title}</p>
            <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(t.createdAt)}</p>
            {t.overdue && <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">Overdue by {humanizeDuration(Date.now() - new Date(t.dueAt).getTime())}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_6rem] gap-1.5 shrink-0 justify-items-end sm:justify-items-stretch">
            <PriorityBadge priority={t.priority} className="w-full text-center" />
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${t.infoAdded ? 'bg-teal-500/15 text-teal-700 dark:text-teal-400' : STATUS_TONE[t.status]}`}>{t.infoAdded ? 'Info added' : STATUS_WORD[t.status]}</span>
          </div>
        </Link>
      ))}</div> : <p className="text-sm text-[var(--text-faint)]">No tickets in the last 7 days.</p>)}
    </Card>
  )
}
