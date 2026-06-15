export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { CollapsibleArchive } from '@/components/ui/CollapsibleArchive'
import { StatusTicketDecks } from '@/components/ui/StatusTicketDecks'
import { TicketList } from '@/components/ui/TicketList'
import { SearchInput } from '@/components/ui/SearchInput'
import { STATUS_LABELS, STATUS_PILL } from '@/lib/utils'
import type { TicketStatus } from '@/lib/types'

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: { status?: string; priority?: string; q?: string }
}) {
  const db = createAdminClient()

  let query = db
    .from('tickets')
    .select('*, profiles(full_name, company_name, sub_store), quotes(id, created_at, status)')
    .order('created_at', { ascending: false })

  if (searchParams.status)   query = query.eq('status', searchParams.status)
  if (searchParams.priority) query = query.eq('priority', searchParams.priority)

  const { data: tickets } = await query

  const activeStatuses = ['open', 'quoted', 'accepted', 'in_progress', 'variation_pending', 'variation_accepted', 'pending_sign_off', 'snag', 'snag_in_progress', 'declined']
  const filterStatuses = ['open', 'quoted', 'accepted', 'in_progress', 'variation_pending', 'variation_accepted', 'pending_sign_off', 'snag', 'snag_in_progress', 'completed', 'declined']

  const noFilter = !searchParams.status && !searchParams.priority
  const queryText = (searchParams.q ?? '').toLowerCase().trim()
  const matches = (t: any) =>
    !queryText ||
    t.title?.toLowerCase().includes(queryText) ||
    t.profiles?.company_name?.toLowerCase().includes(queryText) ||
    t.profiles?.sub_store?.toLowerCase().includes(queryText)
  const base     = (tickets ?? []).filter(matches)
  const active   = noFilter ? base.filter((t: any) => activeStatuses.includes(t.status))        : base
  const archived = noFilter ? base.filter((t: any) => ['completed','cancelled'].includes(t.status)) : []


  const statusCounts = {
    open:        (tickets ?? []).filter((t: any) => t.status === 'open').length,
    quoted:      (tickets ?? []).filter((t: any) => t.status === 'quoted').length,
    accepted:    (tickets ?? []).filter((t: any) => t.status === 'accepted').length,
    in_progress: (tickets ?? []).filter((t: any) => t.status === 'in_progress').length,
    variation_pending: (tickets ?? []).filter((t: any) => t.status === 'variation_pending').length,
    variation_accepted: (tickets ?? []).filter((t: any) => t.status === 'variation_accepted').length,
    pending_sign_off: (tickets ?? []).filter((t: any) => t.status === 'pending_sign_off').length,
    snag:             (tickets ?? []).filter((t: any) => t.status === 'snag').length,
    snag_in_progress: (tickets ?? []).filter((t: any) => t.status === 'snag_in_progress').length,
    completed:        (tickets ?? []).filter((t: any) => t.status === 'completed').length,
    declined:         (tickets ?? []).filter((t: any) => t.status === 'declined').length,
    cancelled:        (tickets ?? []).filter((t: any) => t.status === 'cancelled').length,
  }
  const totalCount = (tickets ?? []).length

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">All Tickets</h1>

      {/* Search — top of page */}
      <SearchInput placeholder="Search by ticket title or store name…" />

      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        <Link href="/supplier/tickets"
          className={`block text-center px-3 py-1 rounded-full text-sm border transition-colors ${noFilter
            ? 'bg-brand-600 text-white border-brand-600'
            : 'bg-slate-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400'}`}>
          All
        </Link>
        {filterStatuses.map(s => {
          const pill = STATUS_PILL[s as TicketStatus]
          return (
            <Link key={s} href={`/supplier/tickets?status=${s}`}
              className={`block text-center px-3 py-1 rounded-full text-sm border transition-colors ${searchParams.status === s
                ? pill.active
                : `bg-slate-50 dark:bg-gray-800 ${pill.inactive}`}`}>
              {STATUS_LABELS[s as keyof typeof STATUS_LABELS]}
            </Link>
          )
        })}
      </div>

      {/* Ticket status breakdown bar */}
      {totalCount > 0 && (
        <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">Ticket Status Breakdown</span>
            <span className="text-gray-500 dark:text-gray-400">{totalCount} ticket{totalCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden flex gap-px">
            {statusCounts.open > 0 && <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round((statusCounts.open/totalCount)*100)}%` }} />}
            {statusCounts.quoted > 0 && <div className="h-full bg-cyan-500 transition-all" style={{ width: `${Math.round((statusCounts.quoted/totalCount)*100)}%` }} />}
            {statusCounts.accepted > 0 && <div className="h-full bg-teal-500 transition-all" style={{ width: `${Math.round((statusCounts.accepted/totalCount)*100)}%` }} />}
            {statusCounts.in_progress > 0 && <div className="h-full bg-amber-500 transition-all" style={{ width: `${Math.round((statusCounts.in_progress/totalCount)*100)}%` }} />}
            {statusCounts.variation_pending > 0 && <div className="h-full bg-purple-500 transition-all" style={{ width: `${Math.round((statusCounts.variation_pending/totalCount)*100)}%` }} />}
            {statusCounts.variation_accepted > 0 && <div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.round((statusCounts.variation_accepted/totalCount)*100)}%` }} />}
            {statusCounts.pending_sign_off > 0 && <div className="h-full bg-orange-500 transition-all" style={{ width: `${Math.round((statusCounts.pending_sign_off/totalCount)*100)}%` }} />}
            {statusCounts.snag > 0 && <div className="h-full bg-red-500 transition-all" style={{ width: `${Math.round((statusCounts.snag/totalCount)*100)}%` }} />}
            {statusCounts.snag_in_progress > 0 && <div className="h-full bg-pink-500 transition-all" style={{ width: `${Math.round((statusCounts.snag_in_progress/totalCount)*100)}%` }} />}
            {statusCounts.completed > 0 && <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.round((statusCounts.completed/totalCount)*100)}%` }} />}
            {statusCounts.declined > 0 && <div className="h-full bg-fuchsia-500 transition-all" style={{ width: `${Math.round((statusCounts.declined/totalCount)*100)}%` }} />}
            {statusCounts.cancelled > 0 && <div className="h-full bg-gray-400 transition-all" style={{ width: `${Math.round((statusCounts.cancelled/totalCount)*100)}%` }} />}
          </div>
        </div>
      )}

      {active.length === 0 && archived.length === 0 ? (
        <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-10 text-center">
          <p className="text-sm text-gray-400">No tickets found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {active.length > 0 && (
            <StatusTicketDecks tickets={active as any} variant="supplier" basePath="/supplier/tickets" />
          )}

          <CollapsibleArchive count={archived.length}>
            <TicketList tickets={archived as any} variant="supplier" basePath="/supplier/tickets" />
          </CollapsibleArchive>
        </div>
      )}
    </div>
  )
}
