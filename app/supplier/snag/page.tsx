export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { AlertTriangle, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import {
  STATUS_COLORS, STATUS_LABELS,
  PRIORITY_COLORS, PRIORITY_LABELS,
  formatDateTime,
} from '@/lib/utils'

export default async function AdminSnagPage() {
  const db = createAdminClient()

  const { data: tickets } = await db
    .from('tickets')
    .select('*, profiles(full_name, company_name, sub_store), completions(id, status, reject_reason, created_at)')
    .in('status', ['snag', 'snag_in_progress'])
    .order('updated_at', { ascending: false })

  const snagTickets = (tickets ?? []) as any[]

  // Group by store
  const byStore: Record<string, { name: string; sub: string; tickets: any[] }> = {}
  for (const t of snagTickets) {
    const key = t.client_id ?? 'unknown'
    if (!byStore[key]) {
      byStore[key] = {
        name: t.profiles?.company_name ?? 'Unknown Store',
        sub:  t.profiles?.sub_store ?? '',
        tickets: [],
      }
    }
    byStore[key].tickets.push(t)
  }
  const storeGroups = Object.entries(byStore)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <AlertTriangle size={20} className="text-amber-500" /> Snag Tickets
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Tickets where the regional manager rejected the COC/POC — re-upload required. Click a branch to view.
        </p>
      </div>

      {storeGroups.length === 0 ? (
        <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center">
          <AlertTriangle size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No snag tickets — all sign-offs are clear.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {storeGroups.map(([storeId, group]) => (
            <details key={storeId} className="group bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              {/* Branch header */}
              <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                <Building2 size={16} className="text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">{group.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{group.sub}</p>
                </div>
                <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2.5 py-0.5 rounded-full font-semibold shrink-0">
                  {group.tickets.length} snag{group.tickets.length !== 1 ? 's' : ''}
                </span>
                <ChevronDown size={16} className="text-gray-400 shrink-0 group-open:hidden" />
                <ChevronUp   size={16} className="text-gray-400 shrink-0 hidden group-open:block" />
              </summary>

              {/* Tickets */}
              <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
                {group.tickets.map((ticket: any) => {
                  const latestRejection = (ticket.completions ?? [])
                    .filter((c: any) => c.status === 'rejected')
                    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                  return (
                    <Link key={ticket.id} href={`/supplier/tickets/${ticket.id}`}>
                      <div className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{ticket.title}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatDateTime(ticket.updated_at)}</p>
                            {latestRejection?.reject_reason && (
                              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 font-medium bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-0.5 inline-block">
                                Rejection: {latestRejection.reject_reason}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 items-end shrink-0">
                            <Badge className={PRIORITY_COLORS[ticket.priority as keyof typeof PRIORITY_COLORS]}>
                              {PRIORITY_LABELS[ticket.priority as keyof typeof PRIORITY_LABELS]}
                            </Badge>
                            <Badge className={STATUS_COLORS[ticket.status as keyof typeof STATUS_COLORS]}>
                              {STATUS_LABELS[ticket.status as keyof typeof STATUS_COLORS]}
                            </Badge>
                          </div>
                        </div>
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

