import { createClient, createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Store, ArrowRight, Users } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export default async function AdminStoresPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // v3: stores live on `stores`; RMs are user_profiles rows; a store's RM is
  // derived via its region (regional_users), not a per-store column.
  // Use the admin client scoped to the caller's company: a supplier has no RLS
  // grant to read `stores` (they're not region/store-linked), so the user client
  // returns nothing — scope explicitly by company_id instead.
  const admin = createAdminClient()
  const { data: prof } = user
    ? await admin.from('user_profiles').select('company_id').eq('id', user.id).single()
    : { data: null }
  const companyId = prof?.company_id ?? null

  const { data: stores } = companyId
    ? await admin
        .from('stores')
        .select('id, name, sub_store, branch_code, region_id')
        .eq('company_id', companyId)
        .order('name')
    : { data: [] as any[] }

  const { data: regionalManagers } = companyId
    ? await admin
        .from('user_profiles')
        .select('id, full_name, company_name')
        .eq('role', 'regional_manager')
        .eq('company_id', companyId)
        .order('full_name')
    : { data: [] as any[] }

  const { data: regionalUsers } = companyId
    ? await admin.from('regional_users').select('user_id, region_id')
    : { data: [] as any[] }

  const rmMap = Object.fromEntries((regionalManagers ?? []).map(rm => [rm.id, rm]))
  // region_id → RM (first RM linked to that region)
  const regionRmMap: Record<string, any> = {}
  for (const link of regionalUsers ?? []) {
    if (link.region_id && !regionRmMap[link.region_id] && rmMap[link.user_id]) {
      regionRmMap[link.region_id] = rmMap[link.user_id]
    }
  }

  // Tickets don't reliably embed off `stores`, so fetch them separately and
  // count per store in JS (tickets link to the store via store_id).
  const storeIds = (stores ?? []).map((s: any) => s.id)
  const { data: tickets } = storeIds.length
    ? await supabase.from('tickets').select('id, status, store_id').in('store_id', storeIds)
    : { data: [] as any[] }
  const ticketsByStore: Record<string, any[]> = {}
  for (const t of tickets ?? []) {
    (ticketsByStore[t.store_id] ??= []).push(t)
  }

  const storeList = (stores ?? []).map((s: any) => {
    const storeTickets = ticketsByStore[s.id] ?? []
    return {
      ...s,
      company_name: s.name,
      openCount:  storeTickets.filter((t: any) => !['completed','cancelled'].includes(t.status)).length,
      totalTickets: storeTickets.length,
      rm: s.region_id ? (regionRmMap[s.region_id] ?? null) : null,
    }
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Store Accounts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{storeList.length} store{storeList.length !== 1 ? 's' : ''} registered</p>
        </div>
      </div>

      {storeList.length === 0 ? (
        <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center">
          <Store size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">No store accounts yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {storeList.map((store: any) => (
            <Link key={store.id} href={`/supplier/stores/${store.id}`}>
              <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:border-brand-400 dark:hover:border-gray-400 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{store.company_name}</p>
                      <span className="text-gray-400 dark:text-gray-500 text-xs shrink-0">·</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{store.sub_store}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-gray-400">{store.email}</p>
                      {store.rm ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 px-2 py-0.5 rounded-full">
                          <Users size={10} />
                          {store.rm.full_name ?? store.rm.company_name}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No RM assigned</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{store.openCount}</p>
                      <p className="text-xs text-gray-400">open</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{store.totalTickets}</p>
                      <p className="text-xs text-gray-400">total</p>
                    </div>
                    <ArrowRight size={16} className="text-gray-400" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
