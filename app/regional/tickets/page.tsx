export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CollapsibleArchive } from '@/components/ui/CollapsibleArchive'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusTicketDecks } from '@/components/ui/StatusTicketDecks'
import { TicketList } from '@/components/ui/TicketList'
import { STATUS_PILL } from '@/lib/utils'

export default async function RegionalTicketsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string; store?: string }
}) {
  const supabase    = createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: rmProfile }, { data: stores }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    adminClient
      .from('profiles')
      .select('id, company_name, sub_store')
      .eq('regional_manager_id', user.id)
      .in('role', ['store_manager', 'client'])
      .is('closed_at', null),
  ])
  if (rmProfile?.role !== 'regional_manager') redirect('/auth/login')

  const storeIds = (stores ?? []).map((s: any) => s.id)
  const storeMap = Object.fromEntries((stores ?? []).map((s: any) => [s.id, s]))

  const { data: tickets } = storeIds.length > 0
    ? await adminClient
        .from('tickets')
        .select('*, quotes(id, status, amount, created_at)')
        .in('client_id', storeIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  const allTickets = (tickets ?? []).map((t: any) => ({
    ...t,
    store: storeMap[t.client_id],
  }))

  // Apply filters
  const activeStatus = searchParams.status ?? ''
  const activeStore  = searchParams.store  ?? ''
  const searchQuery  = (searchParams.q ?? '').toLowerCase().trim()

  const activeStoreName = activeStore
    ? (() => { const s = storeMap[activeStore]; return s ? `${s.company_name} — ${s.sub_store}` : '' })()
    : ''

  const filtered = allTickets.filter((t: any) => {
    const matchesStatus =
      !activeStatus ? true
      : activeStatus === 'quote_approved' ? (t.quotes ?? []).some((q: any) => q.status === 'accepted')
      : t.status === activeStatus
    const matchesStore  = !activeStore  || t.client_id === activeStore
    const matchesSearch = !searchQuery ||
      t.title.toLowerCase().includes(searchQuery) ||
      t.store?.company_name?.toLowerCase().includes(searchQuery) ||
      t.store?.sub_store?.toLowerCase().includes(searchQuery)
    return matchesStatus && matchesStore && matchesSearch
  })

  const active   = filtered.filter((t: any) => !['completed','cancelled','declined'].includes(t.status))
  const archived = filtered.filter((t: any) =>  ['completed','cancelled','declined'].includes(t.status))

  const counts = {
    all:             allTickets.length,
    open:            allTickets.filter((t: any) => t.status === 'open').length,
    quoted:          allTickets.filter((t: any) => t.status === 'quoted').length,
    quote_approved:  allTickets.filter((t: any) => (t.quotes ?? []).some((q: any) => q.status === 'accepted')).length,
    in_progress:     allTickets.filter((t: any) => t.status === 'in_progress').length,
    pending_sign_off:allTickets.filter((t: any) => t.status === 'pending_sign_off').length,
    snag:            allTickets.filter((t: any) => t.status === 'snag').length,
    snag_in_progress:allTickets.filter((t: any) => t.status === 'snag_in_progress').length,
    completed:       allTickets.filter((t: any) => t.status === 'completed').length,
    declined:        allTickets.filter((t: any) => t.status === 'declined').length,
  }

  // Tinted inactive pills share the same slate background prefix
  const pill = (key: keyof typeof STATUS_PILL) => ({
    active:   STATUS_PILL[key].active,
    inactive: `bg-slate-50 dark:bg-gray-800 ${STATUS_PILL[key].inactive}`,
  })
  const filterPills = [
    { label: 'All',            status: '',                 count: counts.all,              active: 'bg-brand-600 text-white border-brand-600', inactive: 'bg-slate-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400' },
    { label: 'Open',           status: 'open',             count: counts.open,             ...pill('open') },
    { label: 'Quoted',         status: 'quoted',           count: counts.quoted,           ...pill('quoted') },
    { label: 'Quote Accepted', status: 'quote_approved',   count: counts.quote_approved,   ...pill('accepted') },
    { label: 'In Progress',    status: 'in_progress',      count: counts.in_progress,      ...pill('in_progress') },
    { label: 'Pending Sign-off', status: 'pending_sign_off', count: counts.pending_sign_off, ...pill('pending_sign_off') },
    { label: 'Snag',           status: 'snag',             count: counts.snag,             ...pill('snag') },
    { label: 'Snag Underway',  status: 'snag_in_progress', count: counts.snag_in_progress, ...pill('snag_in_progress') },
    { label: 'Completed',      status: 'completed',        count: counts.completed,        ...pill('completed') },
    { label: 'Declined',       status: 'declined',         count: counts.declined,         ...pill('declined') },
  ]

  function filterHref(status: string) {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (activeStore) params.set('store', activeStore)
    if (searchQuery) params.set('q', searchQuery)
    const qs = params.toString()
    return `/regional/tickets${qs ? `?${qs}` : ''}`
  }


  const statusCounts = {
    open:             allTickets.filter((t: any) => t.status === 'open').length,
    quoted:           allTickets.filter((t: any) => t.status === 'quoted').length,
    accepted:         allTickets.filter((t: any) => t.status === 'accepted').length,
    in_progress:      allTickets.filter((t: any) => t.status === 'in_progress').length,
    pending_sign_off: allTickets.filter((t: any) => t.status === 'pending_sign_off').length,
    snag:             allTickets.filter((t: any) => t.status === 'snag').length,
    completed:        allTickets.filter((t: any) => t.status === 'completed').length,
    declined:         allTickets.filter((t: any) => t.status === 'declined').length,
    cancelled:        allTickets.filter((t: any) => t.status === 'cancelled').length,
  }
  const totalCount = allTickets.length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">All Tickets</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {filtered.length} of {allTickets.length} ticket{allTickets.length !== 1 ? 's' : ''} across {storeIds.length} store{storeIds.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Search — top of page */}
      <SearchInput placeholder="Search by ticket title or store name…" />

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
            {statusCounts.pending_sign_off > 0 && <div className="h-full bg-orange-500 transition-all" style={{ width: `${Math.round((statusCounts.pending_sign_off/totalCount)*100)}%` }} />}
            {statusCounts.snag > 0 && <div className="h-full bg-red-500 transition-all" style={{ width: `${Math.round((statusCounts.snag/totalCount)*100)}%` }} />}
            {statusCounts.completed > 0 && <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.round((statusCounts.completed/totalCount)*100)}%` }} />}
            {statusCounts.declined > 0 && <div className="h-full bg-fuchsia-500 transition-all" style={{ width: `${Math.round((statusCounts.declined/totalCount)*100)}%` }} />}
            {statusCounts.cancelled > 0 && <div className="h-full bg-gray-400 transition-all" style={{ width: `${Math.round((statusCounts.cancelled/totalCount)*100)}%` }} />}
          </div>
        </div>
      )}

      {/* Active store filter banner */}
      {activeStoreName && (
        <div className="flex items-center justify-between bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800/40 rounded-xl px-4 py-2.5">
          <p className="text-sm font-medium text-brand-700 dark:text-brand-300">
            Filtered by store: <span className="font-semibold">{activeStoreName}</span>
          </p>
          <Link
            href={`/regional/tickets${activeStatus ? `?status=${activeStatus}` : ''}`}
            className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
          >
            Clear store filter ×
          </Link>
        </div>
      )}

      {/* Filter pills */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        {filterPills.map(p => {
          const isActive = activeStatus === p.status
          return (
            <Link
              key={p.label}
              href={filterHref(p.status)}
              className={`flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all text-center ${isActive ? p.active : p.inactive}`}
            >
              {p.label}
              <span className={`font-bold ${isActive ? 'opacity-90' : ''}`}>{p.count}</span>
            </Link>
          )
        })}
      </div>

      {storeIds.length === 0 ? (
        <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">No stores in your region yet.</p>
          <Link href="/regional/stores" className="text-xs text-brand-600 hover:underline mt-1 inline-block">
            Add stores →
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">No tickets match your filter.</p>
          <Link href="/regional/tickets" className="text-xs text-brand-600 hover:underline mt-1 inline-block">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {active.length > 0 && (
            <StatusTicketDecks tickets={active as any} variant="regional" basePath="/regional/tickets" />
          )}

          {archived.length > 0 && (
            <CollapsibleArchive count={archived.length}>
              <TicketList tickets={archived as any} variant="regional" basePath="/regional/tickets" />
            </CollapsibleArchive>
          )}
        </div>
      )}
    </div>
  )
}

