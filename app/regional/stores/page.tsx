export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2, UserPlus, Archive } from 'lucide-react'
import { AddStoreForm } from '@/components/regional/AddStoreForm'
import { StoreCloseControls } from '@/components/regional/StoreCloseControls'
import { CollapsibleArchive } from '@/components/ui/CollapsibleArchive'
import { formatDate } from '@/lib/utils'

export default async function RegionalStoresPage() {
  const supabase    = createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: stores } = await adminClient
    .from('profiles')
    .select(`
      id, full_name, company_name, sub_store, closed_at, closure_reason,
      tickets(id, status, priority, created_at, updated_at)
    `)
    .eq('regional_manager_id', user.id)
    .in('role', ['store_manager', 'client'])
    .order('company_name')

  const storeList = (stores ?? []).map((s: any) => {
    const tickets = s.tickets ?? []

    const counts = {
      open:             tickets.filter((t: any) => t.status === 'open').length,
      quoted:           tickets.filter((t: any) => t.status === 'quoted').length,
      accepted:         tickets.filter((t: any) => t.status === 'accepted').length,
      in_progress:      tickets.filter((t: any) => t.status === 'in_progress').length,
      completed:        tickets.filter((t: any) => t.status === 'completed').length,
      pending_sign_off: tickets.filter((t: any) => t.status === 'pending_sign_off').length,
      snag:             tickets.filter((t: any) => t.status === 'snag').length,
      snag_in_progress: tickets.filter((t: any) => t.status === 'snag_in_progress').length,
      variation_pending:tickets.filter((t: any) => t.status === 'variation_pending').length,
      declined:         tickets.filter((t: any) => t.status === 'declined').length,
      cancelled:        tickets.filter((t: any) => t.status === 'cancelled').length,
      total:            tickets.length,
    }

    // Bar/legend exclude declined & cancelled tickets entirely, so base
    // percentages on the remaining "active" total to avoid an empty gap.
    const barTotal = counts.total - counts.declined - counts.cancelled
    const pct = (n: number) => barTotal > 0 ? Math.round((n / barTotal) * 100) : 0

    // Store health = % of tickets that are settled (completed / declined /
    // cancelled). 100% means nothing is still open, awaiting a quote, in
    // progress, in snag or awaiting sign-off.
    const settled = counts.completed + counts.declined + counts.cancelled
    const health  = counts.total > 0 ? Math.round((settled / counts.total) * 100) : null

    return { ...s, counts, health, pct }
  })

  const activeStores   = storeList.filter((s: any) => !s.closed_at)
  const archivedStores = storeList.filter((s: any) =>  s.closed_at)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">All Stores</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {activeStores.length} store{activeStores.length !== 1 ? 's' : ''} under your management
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Link
            href="/regional/stores/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium px-3 py-1.5 whitespace-nowrap transition-colors"
          >
            <UserPlus size={13} /> Create Store Account(s)
          </Link>
          <AddStoreForm />
        </div>
      </div>

      {activeStores.length === 0 ? (
        <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center">
          <Building2 size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">No active stores.</p>
          <p className="text-xs text-gray-400 mt-1">Create a store account or link one by branch code above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeStores.map((store: any) => (
            <div key={store.id} className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:border-brand-400 dark:hover:border-gray-400 transition-colors">

              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-4">
                <Link href={`/regional/stores/${store.id}`} className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">{store.company_name}</p>
                  <p className="text-sm text-brand-600 dark:text-brand-400 font-medium">{store.sub_store}</p>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  {store.health !== null && (
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      store.health >= 70
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : store.health >= 40
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {store.health}% health
                    </span>
                  )}
                  <StoreCloseControls storeId={store.id} storeName={`${store.company_name} — ${store.sub_store}`} mode="close" />
                </div>
              </div>

              {/* Ticket performance bar — links to store detail */}
              <Link href={`/regional/stores/${store.id}`} className="block">
                {store.counts.total > 0 ? (
                  <div>
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                      <span>Ticket breakdown</span>
                      <span>{store.counts.completed} of {store.counts.total} completed ({store.pct(store.counts.completed)}%)</span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden flex bg-gray-100 dark:bg-gray-700">
                      {store.counts.completed        > 0 && <div className="bg-green-500"  style={{ width: `${store.pct(store.counts.completed)}%` }} />}
                      {store.counts.in_progress      > 0 && <div className="bg-amber-500"  style={{ width: `${store.pct(store.counts.in_progress)}%` }} />}
                      {store.counts.accepted         > 0 && <div className="bg-teal-500"   style={{ width: `${store.pct(store.counts.accepted)}%` }} />}
                      {store.counts.open             > 0 && <div className="bg-blue-500"   style={{ width: `${store.pct(store.counts.open)}%` }} />}
                      {store.counts.quoted           > 0 && <div className="bg-cyan-500"   style={{ width: `${store.pct(store.counts.quoted)}%` }} />}
                      {store.counts.pending_sign_off > 0 && <div className="bg-orange-500" style={{ width: `${store.pct(store.counts.pending_sign_off)}%` }} />}
                      {store.counts.snag             > 0 && <div className="bg-red-500"    style={{ width: `${store.pct(store.counts.snag)}%` }} />}
                      {store.counts.snag_in_progress > 0 && <div className="bg-pink-500"   style={{ width: `${store.pct(store.counts.snag_in_progress)}%` }} />}
                      {store.counts.variation_pending> 0 && <div className="bg-purple-500" style={{ width: `${store.pct(store.counts.variation_pending)}%` }} />}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-x-3 gap-y-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {store.counts.completed        > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500  inline-block" />{store.pct(store.counts.completed)}% completed ({store.counts.completed})</span>}
                      {store.counts.in_progress      > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500  inline-block" />{store.pct(store.counts.in_progress)}% in progress ({store.counts.in_progress})</span>}
                      {store.counts.accepted         > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500   inline-block" />{store.pct(store.counts.accepted)}% accepted ({store.counts.accepted})</span>}
                      {store.counts.open             > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500   inline-block" />{store.pct(store.counts.open)}% open ({store.counts.open})</span>}
                      {store.counts.quoted           > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500   inline-block" />{store.pct(store.counts.quoted)}% quoted ({store.counts.quoted})</span>}
                      {store.counts.pending_sign_off > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />{store.pct(store.counts.pending_sign_off)}% sign-off ({store.counts.pending_sign_off})</span>}
                      {store.counts.snag             > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500    inline-block" />{store.pct(store.counts.snag)}% snag ({store.counts.snag})</span>}
                      {store.counts.snag_in_progress > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pink-500   inline-block" />{store.pct(store.counts.snag_in_progress)}% snag underway ({store.counts.snag_in_progress})</span>}
                      {store.counts.variation_pending> 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />{store.pct(store.counts.variation_pending)}% variation pending ({store.counts.variation_pending})</span>}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No tickets yet</p>
                )}
              </Link>

            </div>
          ))}
        </div>
      )}

      {/* Archived / closed stores */}
      {archivedStores.length > 0 && (
        <CollapsibleArchive count={archivedStores.length}>
          <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {archivedStores.map((store: any) => (
              <div key={store.id} className="flex items-start justify-between gap-3 p-4">
                <Link href={`/regional/stores/${store.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Archive size={14} className="text-gray-400 shrink-0" />
                    <p className="font-medium text-sm text-gray-700 dark:text-gray-200 truncate">{store.company_name} — {store.sub_store}</p>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Closed {store.closed_at ? formatDate(store.closed_at) : ''}
                    {store.closure_reason ? ` · ${store.closure_reason}` : ''}
                  </p>
                </Link>
                <StoreCloseControls storeId={store.id} storeName={`${store.company_name} — ${store.sub_store}`} mode="reopen" />
              </div>
            ))}
          </div>
        </CollapsibleArchive>
      )}
    </div>
  )
}

