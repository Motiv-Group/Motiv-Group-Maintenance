'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { StoreManagerTicket } from '@/lib/health/data'
import { Card } from '@/components/exec/ui'
import { formatDateTime } from '@/lib/utils'

const STATUS_TONE: Record<string, string> = {
  open: 'text-blue-600 dark:text-blue-400',
  in_progress: 'text-amber-600 dark:text-[#C6A35D]',
  completed: 'text-emerald-600 dark:text-emerald-400',
}
const STATUS_WORD: Record<string, string> = { open: 'Open', in_progress: 'In Progress', completed: 'Completed' }
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Store-manager dashboard "Recent Tickets" — last 7 days only, collapsible. */
export function RecentTicketsCard({ tickets }: { tickets: StoreManagerTicket[] }) {
  const [open, setOpen] = useState(true)
  const recent = useMemo(() => {
    const cutoff = Date.now() - WEEK_MS
    return tickets.filter(t => new Date(t.createdAt).getTime() >= cutoff)
  }, [tickets])

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 text-sm font-bold text-[var(--text)]" aria-expanded={open}>
          Recent Tickets
          <span className="text-[11px] font-normal text-[var(--text-faint)]">· last 7 days ({recent.length})</span>
          <ChevronDown size={15} className={`text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <Link href="/client/tickets" className="text-xs text-[#C6A35D] hover:underline">All</Link>
      </div>

      {open && (recent.length ? recent.map(t => (
        <Link key={t.id} href={`/client/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
          <div className="min-w-0"><p className="text-sm text-[var(--text)] truncate">{t.title}</p><p className="text-[11px] text-[var(--text-faint)]">{t.category ?? 'General'} · {formatDateTime(t.createdAt)}</p></div>
          <span className={`text-[11px] font-semibold shrink-0 ${STATUS_TONE[t.status]}`}>{STATUS_WORD[t.status]}</span>
        </Link>
      )) : <p className="text-sm text-[var(--text-faint)]">No tickets in the last 7 days.</p>)}
    </Card>
  )
}
