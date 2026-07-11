'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import {
  STATUS_COLORS, STATUS_LABELS,
  PRIORITY_COLORS, PRIORITY_LABELS,
  formatDateTimeShort, formatJobId,
} from '@/lib/utils'

const STALE_MS = 7 * 24 * 60 * 60 * 1000

export interface RecentTicket {
  id: string
  job_number?: number | null
  job_ref?: string | null
  title: string
  status: string
  priority: string
  created_at: string
  /** Regional variant: store info */
  store?: { company_name?: string | null; sub_store?: string | null }
  /** Admin variant: client profile */
  profiles?: { company_name?: string | null; sub_store?: string | null; full_name?: string | null }
  quotes?: { status: string; created_at: string }[]
}

type Variant = 'regional' | 'supplier' | 'client'

export function TicketContent({ ticket, variant }: { ticket: RecentTicket; variant: Variant }) {
  const latestQuote = (ticket.quotes ?? [])
    .filter(q => q.status !== 'declined')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

  const companyName = variant === 'supplier'
    ? ticket.profiles?.company_name
    : ticket.store?.company_name

  const subStore = variant === 'supplier'
    ? ticket.profiles?.sub_store
    : ticket.store?.sub_store

  const jobId = ticket.job_ref ?? formatJobId(ticket.job_number)
  // eslint-disable-next-line react-hooks/purity -- Date.now() flags a ticket open >7 days to show a "7d+" badge; cosmetic staleness indicator, not a hydration-correctness concern
  const isStaleOpen = ticket.status === 'open' && Date.now() - new Date(ticket.created_at).getTime() > STALE_MS

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        {jobId && <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 mb-0.5">{jobId}</p>}
        {variant === 'supplier' ? (
          <>
            <p className="font-bold text-base text-gray-900 dark:text-white truncate">{companyName ?? '—'}</p>
            <p className="text-xs text-gray-600 dark:text-gray-300 truncate mt-0.5">{ticket.title}</p>
          </>
        ) : variant === 'client' ? (
          <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{ticket.title}</p>
        ) : (
          <>
            <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{ticket.title}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {companyName} — {subStore}
            </p>
          </>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 truncate">
          Created: {formatDateTimeShort(ticket.created_at)}
          {latestQuote && (
            <span className="text-purple-500 dark:text-purple-400"> · Quoted: {formatDateTimeShort(latestQuote.created_at)}</span>
          )}
        </p>
      </div>

      {/* Priority + Status — right side */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isStaleOpen && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 whitespace-nowrap">7d+</span>
        )}
        <Badge className={`text-xs ${PRIORITY_COLORS[ticket.priority as keyof typeof PRIORITY_COLORS]}`}>
          {PRIORITY_LABELS[ticket.priority as keyof typeof PRIORITY_LABELS]}
        </Badge>
        <Badge className={`text-xs ${STATUS_COLORS[ticket.status as keyof typeof STATUS_COLORS]}`}>
          {STATUS_LABELS[ticket.status as keyof typeof STATUS_LABELS]}
        </Badge>
      </div>
    </div>
  )
}

interface RecentTicketsStackProps {
  tickets: RecentTicket[]
  variant?: Variant
  /** Base path for ticket detail links, e.g. '/regional/tickets' or '/supplier/tickets' */
  basePath?: string
  /** Label shown next to ticket count, e.g. 'last 7 days' or 'need attention' */
  countLabel?: string
}

export function RecentTicketsStack({
  tickets,
  variant = 'regional',
  basePath,
  countLabel = 'last 7 days',
}: RecentTicketsStackProps) {
  const [expanded, setExpanded] = useState(false)

  const detailPath = basePath ?? (variant === 'supplier' ? '/supplier/tickets' : '/regional/tickets')

  if (tickets.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
        No tickets in the last 7 days.
      </p>
    )
  }

  const topTicket = tickets[0]
  const layerCount = Math.min(tickets.length - 1, 2)

  const collapseBar = (
    <button
      onClick={() => setExpanded(false)}
      className="w-full text-xs text-[#C6A35D] hover:text-amber-600 flex items-center justify-between py-2 px-1 transition-colors"
    >
      <span className="flex items-center gap-1 font-medium">
        <ChevronUp size={12} /> Collapse
      </span>
      <span className="text-gray-400 dark:text-gray-500">
        {tickets.length} ticket{tickets.length !== 1 ? 's' : ''} · {countLabel}
      </span>
    </button>
  )

  return (
    <div>
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="w-full text-left focus:outline-none group"
          aria-label="Expand recent tickets"
        >
          <div className="relative mb-4">

            {/* Layer 2 — deepest, most inset */}
            {layerCount >= 2 && (
              <div
                className="absolute rounded-xl bg-slate-300 dark:bg-gray-600"
                style={{ left: '14px', right: '14px', top: 0, bottom: '-10px', zIndex: 0 }}
              />
            )}

            {/* Layer 1 — middle */}
            {layerCount >= 1 && (
              <div
                className="absolute rounded-xl bg-slate-200 dark:bg-gray-700"
                style={{ left: '7px', right: '7px', top: 0, bottom: '-5px', zIndex: 1 }}
              />
            )}

            {/* Top card */}
            <div
              className="relative bg-white dark:bg-gray-800 border border-[var(--border)] dark:border-gray-700 rounded-xl p-4 shadow-sm group-hover:border-brand-400 dark:group-hover:border-gray-500 group-hover:shadow-md transition-all"
              style={{ zIndex: 2 }}
            >
              <TicketContent ticket={topTicket} variant={variant} />

              <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {tickets.length} ticket{tickets.length !== 1 ? 's' : ''} · {countLabel}
                </span>
                <span className="text-xs font-medium text-[#C6A35D] flex items-center gap-1">
                  View all <ChevronDown size={11} />
                </span>
              </div>
            </div>
          </div>
        </button>
      ) : (
        <div>
          {/* Collapse button — TOP */}
          <div className="mb-3">{collapseBar}</div>

          <div className="space-y-2">
            {tickets.map(ticket => (
              <Link key={ticket.id} href={`${detailPath}/${ticket.id}`}>
                <div className="bg-white dark:bg-gray-800 border border-[var(--border)] dark:border-gray-700 rounded-xl p-4 hover:border-brand-400 dark:hover:border-gray-500 transition-colors">
                  <TicketContent ticket={ticket} variant={variant} />
                </div>
              </Link>
            ))}
          </div>

          {/* Collapse button — BOTTOM */}
          <div className="mt-3">{collapseBar}</div>
        </div>
      )}
    </div>
  )
}
