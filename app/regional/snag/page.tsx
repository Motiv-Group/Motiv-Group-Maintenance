export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { AlertTriangle, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { PRIORITY_COLORS, PRIORITY_LABELS, STATUS_COLORS, STATUS_LABELS, formatDateTime } from '@/lib/utils'

export default async function RegionalSnagPage() {
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
        .select('*, completions(id, status, reject_reason, created_at)')
        .in('client_id', storeIds)
        .in('status', ['snag', 'snag_in_progress'])
        .order('updated_at', { ascending: false })
    : { data: [] }

  const snagTickets = (tickets ?? []) as any[]

  const byStore: Record<string, { store: any; tickets: any[] }> = {}
  for (const ticket of snagTickets) {
    const storeId = ticket.client_id
    if (!byStore[storeId]) byStore[storeId] = { store: storeMap[storeId], tickets: [] }
    byStore[storeId].tickets.push(ticket)
  }
  const storeGroups = Object.values(byStore)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <AlertTriangle size={20} className="text-amber-500" /> Snag Tickets
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Tickets where COC/POC was rejected — rework required. Click a branch to view its tickets.
        </p>
      </div>

      {storeGroups.length === 0 ? (
        <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center">
          <AlertTriangle size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No snag tickets — all clear.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {storeGroups.map(({ store, tickets: storeTickets }) => (
            <details key={store?.id ?? 'unknown'} className="group bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              {/* Branch header — always visible, click to expand */}
              <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                <Building2 size={16} className="text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">{store?.company_name ?? 'Unknown Store'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{store?.sub_store}</p>
                </div>
                <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2.5 py-0.5 rounded-full font-semibold shrink-0">
                  {storeTickets.length} snag{storeTickets.length !== 1 ? 's' : ''}
                </span>
                <ChevronDown size={16} className="text-gray-400 shrink-0 group-open:hidden" />
                <ChevronUp   size={16} className="text-gray-400 shrink-0 hidden group-open:block" />
              </summary>

              {/* Tickets — shown when expanded */}
              <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
                {storeTickets.map((ticket: any) => {
                  const latestRejection = (ticket.completions ?? [])
                    .filter((c: any) => c.status === 'rejected')
                    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                  return (
                    <Link key={ticket.id} href={`/regional/tickets/${ticket.id}`}>
                      <div className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{ticket.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {store?.company_name ?? '—'} — {store?.sub_store ?? '—'}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <Badge className={PRIORITY_COLORS[ticket.priority as keyof typeof PRIORITY_COLORS]}>
                            {PRIORITY_LABELS[ticket.priority as keyof typeof PRIORITY_LABELS]}
                          </Badge>
                          <Badge className={STATUS_COLORS[ticket.status as keyof typeof STATUS_COLORS]}>
                            {STATUS_LABELS[ticket.status as keyof typeof STATUS_LABELS]}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                          Updated: {formatDateTime(ticket.updated_at)}
                        </p>
                        {latestRejection?.reject_reason && (
                          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 font-medium bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-0.5 inline-block">
                            Rejection: {latestRejection.reject_reason}
                          </p>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}

