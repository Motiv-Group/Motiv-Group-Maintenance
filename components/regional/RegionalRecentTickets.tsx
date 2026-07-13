'use client'

// RM dashboard "Recent Tickets" — 5 most recent, collapsible (mirrors the SM card).
// Shows ticket title + store name/branch code + priority & status badges; the
// whole row links to the ticket overview.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { RegionalTicketRow } from '@/lib/health/data'
import { Card } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { readCollapse, writeCollapse } from '@/lib/collapse-state'
import { rmStatusMeta, formatDateTime, humanizeDuration } from '@/lib/utils'

const MAX_RECENT = 5

export function RegionalRecentTickets({ tickets }: { tickets: RegionalTicketRow[] }) {
  const [open, setOpen] = useState(false)
  // Remember the expand/collapse choice across navigation (wiped on next sign-in).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- restores persisted open state from localStorage (client-only) after mount; cannot run during SSR render
  useEffect(() => { const v = readCollapse('rm-recent-open'); if (v !== null) setOpen(v) }, [])
  const toggle = () => setOpen(o => { const v = !o; writeCollapse('rm-recent-open', v); return v })
  const recent = useMemo(() => {
    // Completed tickets live in the Tickets-tab archive; cancelled ones are hidden.
    return tickets
      .filter(t => t.status !== 'completed' && t.status !== 'cancelled')
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, MAX_RECENT)
  }, [tickets])

  return (
    <Card className="p-5 cursor-pointer hover:ring-[#C6A35D]/30 transition" onClick={toggle} role="button" tabIndex={0} aria-expanded={open}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="flex items-center gap-2 min-w-0">
          <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
          <span className="text-sm font-bold text-[var(--text)]">Recent Tickets</span>
          <span className="text-[11px] font-medium text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5 whitespace-nowrap">Latest {recent.length}</span>
        </span>
        <Link href="/regional/tickets" onClick={e => e.stopPropagation()} className="text-xs font-medium text-[#C6A35D] hover:underline shrink-0">All</Link>
      </div>

      {open && (recent.length ? <div onClick={e => e.stopPropagation()}>{recent.map(t => {
        const sm = rmStatusMeta(t.status)
        return (
          <Link key={t.id} href={`/regional/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
            <div className="min-w-0">
              <p className="text-sm text-[var(--text)] truncate">{t.title}</p>
              <p className="text-[11px] text-[var(--text-faint)] truncate">{t.storeName}{t.branchCode ? ` · ${t.branchCode}` : ''} · {formatDateTime(t.createdAt)}</p>
              {/* eslint-disable-next-line react-hooks/purity -- Date.now() drives a relative "overdue by" display; cosmetic elapsed-time readout, not a hydration-correctness concern */}
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
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${t.disputed ? 'bg-red-500/15 text-red-700 dark:text-red-400' : t.infoAdded ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : sm.cls}`}>{t.disputed ? 'Dispute' : t.infoAdded ? 'Info added' : sm.label}</span>
            </div>
          </Link>
        )
      })}</div> : <p className="text-sm text-[var(--text-faint)]">No recent tickets.</p>)}
    </Card>
  )
}
