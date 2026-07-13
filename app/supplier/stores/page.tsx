import { createClient, createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Store, ArrowRight, Users } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { formatDate } from '@/lib/utils'

export default async function AdminStoresPage() {
  const supabase = await createClient()
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
          <h1 className="text-xl font-bold text-[var(--text)]">Store Accounts</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">{storeList.length} store{storeList.length !== 1 ? 's' : ''} registered</p>
        </div>
      </div>

      {storeList.length === 0 ? (
        <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center">
          <div>
            <Store size={28} className="mx-auto text-[var(--text-faint)] mb-2" />
            <p className="text-sm text-[var(--text-faint)]">No store accounts yet.</p>
          </div>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          {storeList.map((store: any) => (
            <Link
              key={store.id}
              href={`/supplier/stores/${store.id}`}
              className="block px-4 py-3 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm text-[var(--text)] truncate">{store.company_name}</p>
                    <span className="text-[var(--text-faint)] text-xs shrink-0">·</span>
                    <p className="text-xs text-[var(--text-muted)] truncate">{store.sub_store}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-xs text-[var(--text-faint)]">{store.email}</p>
                    {store.rm ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-blue-500/15 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
                        <Users size={10} />
                        {store.rm.full_name ?? store.rm.company_name}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--text-faint)] italic">No RM assigned</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[var(--text)]">{store.openCount}</p>
                    <p className="text-xs text-[var(--text-faint)]">open</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[var(--text)]">{store.totalTickets}</p>
                    <p className="text-xs text-[var(--text-faint)]">total</p>
                  </div>
                  <ArrowRight size={16} className="text-[var(--text-faint)]" />
                </div>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}
