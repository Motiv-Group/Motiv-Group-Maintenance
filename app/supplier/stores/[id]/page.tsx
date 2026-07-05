import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { Mail, Phone, MapPin, Building2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { MapLink } from '@/components/ui/MapLink'
import { AssignRMForm } from '@/components/admin/AssignRMForm'
import {
  STATUS_COLORS, STATUS_LABELS,
  PRIORITY_COLORS, PRIORITY_LABELS,
  formatDate,
} from '@/lib/utils'
import type { Ticket } from '@/lib/types'

export default async function AdminStoreDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  // v3: the store lives on `stores`; regional managers are user_profiles rows.
  const [{ data: storeRow }, { data: tickets }, { data: regionalManagers }] = await Promise.all([
    supabase
      .from('stores')
      .select('id, name, sub_store, branch_code, address, region_id')
      .eq('id', params.id)
      .single(),
    supabase
      .from('tickets')
      .select('*, quotes(id, amount, status)')
      .eq('store_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_profiles')
      .select('id, full_name, company_name')
      .eq('role', 'regional_manager')
      .order('full_name'),
  ])

  if (!storeRow) notFound()

  // v3: a store links to its RM through its region (regional_users). Resolve the
  // current RM (if any) for this store's region.
  const { data: regionRms } = storeRow.region_id
    ? await supabase.from('regional_users').select('user_id').eq('region_id', storeRow.region_id)
    : { data: [] as { user_id: string }[] }
  const currentRmId = (regionRms ?? [])[0]?.user_id ?? null

  // Store-manager contact details live on user_profiles via the store_users link.
  const { data: smLink } = await supabase
    .from('store_users').select('user_id').eq('store_id', params.id).limit(1).maybeSingle()
  const { data: sm } = smLink?.user_id
    ? await supabase.from('user_profiles').select('full_name, email, phone').eq('id', smLink.user_id).single()
    : { data: null as { full_name?: string | null; email?: string | null; phone?: string | null } | null }

  const store = {
    ...storeRow,
    company_name: storeRow.name,
    regional_manager_id: currentRmId,
    full_name: sm?.full_name ?? null,
    email: sm?.email ?? null,
    phone: sm?.phone ?? null,
  }

  const currentRm = currentRmId
    ? (regionalManagers ?? []).find((rm: any) => rm.id === currentRmId)
    : null

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{store.company_name}</h1>
          <p className="text-sm text-brand-600 dark:text-brand-400">{store.sub_store}</p>
        </div>
      </div>

      {/* Store info */}
      <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Store Info</p>
        {store.full_name && (
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <Building2 size={14} className="text-gray-400" />
            <span>{store.full_name}</span>
          </div>
        )}
        {store.branch_code && (
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <span className="text-gray-400 font-mono text-xs">CODE</span>
            <span className="font-mono font-semibold">{store.branch_code}</span>
          </div>
        )}
        {store.email && (
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <Mail size={14} className="text-gray-400" />
            <a href={`mailto:${store.email}`} className="hover:underline">{store.email}</a>
          </div>
        )}
        {store.phone && (
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <Phone size={14} className="text-gray-400" />
            <a href={`tel:${store.phone}`} className="hover:underline">{store.phone}</a>
          </div>
        )}
        {store.address && (
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <MapPin size={14} className="text-gray-400" />
            <MapLink address={store.address} className="hover:underline">{store.address}</MapLink>
          </div>
        )}
      </div>

      {/* Assign Regional Manager */}
      <AssignRMForm
        storeId={store.id}
        currentRmId={store.regional_manager_id}
        currentRmName={currentRm?.full_name ?? currentRm?.company_name ?? null}
        regionalManagers={regionalManagers ?? []}
      />

      {/* Tickets */}
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3">
          Tickets ({tickets?.length ?? 0})
        </h2>
        {!tickets?.length ? (
          <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center">
            <p className="text-sm text-gray-400">No tickets from this store yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(tickets as Ticket[]).map(ticket => (
              <Link key={ticket.id} href={`/supplier/tickets/${ticket.id}`}>
                <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:border-brand-400 dark:hover:border-gray-400 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{ticket.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(ticket.created_at)}</p>
                    </div>
                    <div className="flex flex-col gap-1 items-end shrink-0">
                      <Badge className={PRIORITY_COLORS[ticket.priority]}>
                        {PRIORITY_LABELS[ticket.priority]}
                      </Badge>
                      <Badge className={STATUS_COLORS[ticket.status]}>
                        {STATUS_LABELS[ticket.status]}
                      </Badge>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
