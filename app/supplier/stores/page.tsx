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

  // ── Supplier-visibility gate (cross-supplier isolation) ──────────────────
  // Suppliers are COMPETING OUTSIDERS inside one company. This directory must
  // only list stores the caller's supplier org is ENGAGED with — i.e. stores
  // holding at least one ticket AWARDED to them (tickets.supplier_id) or with
  // a quote INVITE for them (ticket_suppliers → tickets → store_id). Listing
  // the whole company estate (+ its RM roster) would hand every supplier a
  // map of competitors' client sites and RM contacts.
  const { data: supplierLinks } = user
    ? await admin.from('supplier_users').select('supplier_id').eq('user_id', user.id)
    : { data: null }
  const supplierIds = (supplierLinks ?? []).map(l => l.supplier_id)

  const [{ data: awardedTickets }, { data: inviteRows }] = supplierIds.length
    ? await Promise.all([
        admin.from('tickets').select('store_id').in('supplier_id', supplierIds),
        admin.from('ticket_suppliers').select('ticket_id').in('supplier_id', supplierIds),
      ])
    : [{ data: null }, { data: null }]

  const inviteTicketIds = (inviteRows ?? []).map(r => r.ticket_id)
  const { data: invitedTickets } = inviteTicketIds.length
    ? await admin.from('tickets').select('store_id').in('id', inviteTicketIds)
    : { data: null }

  const engagedStoreIds = Array.from(new Set(
    [...(awardedTickets ?? []), ...(invitedTickets ?? [])]
      .map(t => t.store_id)
      .filter((id): id is string => !!id)
  ))

  // Tenant guard stays the outer layer (company_id); the engagement gate
  // narrows within the company.
  const { data: stores } = companyId && engagedStoreIds.length
    ? await admin
        .from('stores')
        .select('id, name, sub_store, branch_code, region_id')
        .eq('company_id', companyId)
        .in('id', engagedStoreIds)
        .order('name')
    : { data: null }

  // Only the RMs of the engaged stores' regions — never the company's full
  // RM roster (competitor intel / PII).
  const engagedRegionIds = Array.from(new Set(
    (stores ?? []).map(s => s.region_id).filter((id): id is string => !!id)
  ))
  const { data: regionalUsers } = engagedRegionIds.length
    ? await admin.from('regional_users').select('user_id, region_id').in('region_id', engagedRegionIds)
    : { data: null }

  const rmUserIds = Array.from(new Set((regionalUsers ?? []).map(l => l.user_id)))
  const { data: regionalManagers } = companyId && rmUserIds.length
    ? await admin
        .from('user_profiles')
        .select('id, full_name, company_name')
        .eq('role', 'regional_manager')
        .eq('company_id', companyId)
        .in('id', rmUserIds)
        .order('full_name')
    : { data: null }

  type RmRow = NonNullable<typeof regionalManagers>[number]
  const rmMap = Object.fromEntries((regionalManagers ?? []).map(rm => [rm.id, rm] as const))
  // region_id → RM (first RM linked to that region)
  const regionRmMap: Record<string, RmRow> = {}
  for (const link of regionalUsers ?? []) {
    if (link.region_id && !regionRmMap[link.region_id] && rmMap[link.user_id]) {
      regionRmMap[link.region_id] = rmMap[link.user_id]
    }
  }

  // Tickets don't reliably embed off `stores`, so fetch them separately and
  // count per store in JS (tickets link to the store via store_id).
  const storeIds = (stores ?? []).map(s => s.id)
  const { data: tickets } = storeIds.length
    ? await supabase.from('tickets').select('id, status, store_id').in('store_id', storeIds)
    : { data: null }
  const ticketsByStore: Record<string, NonNullable<typeof tickets>> = {}
  for (const t of tickets ?? []) {
    // store_id is non-null here — rows were fetched with .in('store_id', storeIds)
    (ticketsByStore[t.store_id as string] ??= []).push(t)
  }

  // `email` is never selected off `stores` (no such column) — typed optional so the
  // pre-existing `{store.email}` render below stays an empty slot, unchanged.
  type StoreListItem = NonNullable<typeof stores>[number] & { company_name: string; openCount: number; totalTickets: number; rm: RmRow | null; email?: string }
  const storeList: StoreListItem[] = (stores ?? []).map(s => {
    const storeTickets = ticketsByStore[s.id] ?? []
    return {
      ...s,
      company_name: s.name,
      openCount:  storeTickets.filter(t => !['completed','cancelled'].includes(t.status)).length,
      totalTickets: storeTickets.length,
      rm: s.region_id ? (regionRmMap[s.region_id] ?? null) : null,
    }
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Store Accounts</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">{storeList.length} engaged store{storeList.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {storeList.length === 0 ? (
        <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center">
          <div>
            <Store size={28} className="mx-auto text-[var(--text-faint)] mb-2" />
            <p className="text-sm text-[var(--text-faint)]">No stores yet — you&apos;ll see a store here once you&apos;re invited to quote or awarded work there.</p>
          </div>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          {storeList.map(store => (
            <Link
              key={store.id}
              href={`/supplier/stores/${store.id}`}
              className="block px-4 py-3 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-semibold text-sm text-[var(--text)] truncate min-w-0">{store.company_name}</p>
                    <span className="text-[var(--text-faint)] text-xs shrink-0">·</span>
                    <p className="text-xs text-[var(--text-muted)] truncate shrink-0 max-w-[45%]">{store.sub_store}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1 min-w-0">
                    <p className="text-xs text-[var(--text-faint)]">{store.email}</p>
                    {store.rm ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-blue-500/15 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full max-w-full shrink">
                        <Users size={10} className="shrink-0" />
                        <span className="truncate min-w-0">{store.rm.full_name ?? store.rm.company_name}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--text-faint)] italic">No contact assigned</span>
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
