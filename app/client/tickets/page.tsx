export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CollapsibleArchive } from '@/components/ui/CollapsibleArchive'
import { StatusTicketDecks } from '@/components/ui/StatusTicketDecks'
import { TicketList } from '@/components/ui/TicketList'
import { clientVisibleStatus, STATUS_PILL } from '@/lib/utils'

// Store managers only ever see three states; everything in between collapses.
const VISIBLE_STATUSES = ['open', 'in_progress', 'completed']

export default async function ClientTicketsPage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch every ticket so a quoted / in-flight ticket never disappears, then
  // collapse its status to what the store manager is allowed to see.
  const { data: tickets } = await supabase
    .from('tickets')
    .select('*')
    .eq('client_id', user!.id)
    .order('created_at', { ascending: false })

  const allTickets = (tickets ?? [])
    .map(t => ({ ...t, status: clientVisibleStatus(t.status) }))
    .filter((t): t is typeof t & { status: 'open' | 'in_progress' | 'completed' } => t.status !== null)

  // Apply filter from URL param (must be one of the visible statuses)
  const activeFilter = searchParams.status && VISIBLE_STATUSES.includes(searchParams.status)
    ? searchParams.status
    : null

  const displayed = activeFilter
    ? allTickets.filter(t => t.status === activeFilter)
    : allTickets

  const active   = activeFilter ? displayed : displayed.filter(t => t.status !== 'completed')
  const archived = activeFilter ? []        : displayed.filter(t => t.status === 'completed')

  const counts = {
    open:        allTickets.filter(t => t.status === 'open').length,
    in_progress: allTickets.filter(t => t.status === 'in_progress').length,
    completed:   allTickets.filter(t => t.status === 'completed').length,
  }
  const total = allTickets.length

  const FILTER_TABS = [
    { key: null,          label: 'All'         },
    { key: 'open',        label: 'Open'        },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'completed',   label: 'Completed'   },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">My Tickets</h1>
        <Link href="/client/tickets/new">
          <Button size="sm"><Plus size={16} className="mr-1" />New Ticket</Button>
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        {FILTER_TABS.map(tab => {
          const isActive = tab.key === null ? !searchParams.status : tab.key === searchParams.status
          const pill = tab.key ? STATUS_PILL[tab.key as 'open' | 'in_progress' | 'completed'] : null
          const activeCls   = pill ? pill.active : 'bg-brand-600 text-white border-brand-600'
          const inactiveCls = pill ? `bg-slate-50 dark:bg-gray-800 ${pill.inactive}` : 'bg-slate-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400'
          return (
            <Link
              key={tab.label}
              href={tab.key ? `/client/tickets?status=${tab.key}` : '/client/tickets'}
              className={`block text-center px-3 py-1 rounded-full text-sm border transition-colors ${isActive ? activeCls : inactiveCls}`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {/* Status breakdown bar — only on All view */}
      {!activeFilter && total > 0 && (
        <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">Ticket Overview</span>
            <span className="text-gray-500 dark:text-gray-400">{total} ticket{total !== 1 ? 's' : ''}</span>
          </div>
          <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden flex">
            {counts.completed   > 0 && <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.round((counts.completed/total)*100)}%` }} />}
            {counts.in_progress > 0 && <div className="h-full bg-amber-500 transition-all" style={{ width: `${Math.round((counts.in_progress/total)*100)}%` }} />}
            {counts.open        > 0 && <div className="h-full bg-blue-500 transition-all"  style={{ width: `${Math.round((counts.open/total)*100)}%` }} />}
          </div>
          <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500 dark:text-gray-400">
            {counts.open        > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500  inline-block" />Open ({counts.open})</span>}
            {counts.in_progress > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />In Progress ({counts.in_progress})</span>}
            {counts.completed   > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Completed ({counts.completed})</span>}
          </div>
        </div>
      )}

      {displayed.length === 0 ? (
        <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-10 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
            {activeFilter ? 'No tickets in this category.' : 'No tickets yet.'}
          </p>
          {!activeFilter && (
            <Link href="/client/tickets/new">
              <Button variant="secondary" size="sm">Submit your first ticket</Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {active.length === 0 && !activeFilter ? (
              <p className="text-sm text-gray-400 text-center py-4">No active tickets.</p>
            ) : (
              <StatusTicketDecks tickets={active as any} variant="client" basePath="/client/tickets" />
            )}
          </div>

          {archived.length > 0 && (
            <CollapsibleArchive count={archived.length}>
              <TicketList tickets={archived as any} variant="client" basePath="/client/tickets" />
            </CollapsibleArchive>
          )}
        </>
      )}
    </div>
  )
}

