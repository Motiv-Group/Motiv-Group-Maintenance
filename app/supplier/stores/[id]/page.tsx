import { createClient, createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { Mail, Phone, MapPin, Building2 } from 'lucide-react'
import { Card, SectionCard } from '@/components/exec/ui'
import { CategoryIcon } from '@/components/client/ticketBadges'
import { MapLink } from '@/components/ui/MapLink'
import { AssignRMForm } from '@/components/admin/AssignRMForm'
import {
  STATUS_COLORS, STATUS_LABELS,
  PRIORITY_COLORS, PRIORITY_LABELS,
  formatDate,
} from '@/lib/utils'
import type { Ticket } from '@/lib/types'

export default async function AdminStoreDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Use the admin client scoped to the caller's company: a supplier has no RLS
  // grant to read `stores`, so the user client would 404 the page. Tenant safety
  // is enforced by the company_id check below (admin bypasses RLS).
  const admin = createAdminClient()
  const { data: prof } = user
    ? await admin.from('user_profiles').select('company_id').eq('id', user.id).single()
    : { data: null }
  const companyId = prof?.company_id ?? null

  // v3: the store lives on `stores`; regional managers are user_profiles rows.
  const [{ data: storeRow }, { data: tickets }, { data: regionalManagers }] = await Promise.all([
    admin
      .from('stores')
      .select('id, name, sub_store, branch_code, address, region_id, company_id')
      .eq('id', params.id)
      .single(),
    admin
      .from('tickets')
      .select('*, quotes(id, amount, status)')
      .eq('store_id', params.id)
      .order('created_at', { ascending: false }),
    companyId
      ? admin
          .from('user_profiles')
          .select('id, full_name, company_name')
          .eq('role', 'regional_manager')
          .eq('company_id', companyId)
          .order('full_name')
      : Promise.resolve({ data: [] as any[] }),
  ])

  // Tenant guard — the store must belong to the caller's company.
  if (!storeRow || !companyId || storeRow.company_id !== companyId) notFound()

  // v3: a store links to its RM through its region (regional_users). Resolve the
  // current RM (if any) for this store's region.
  const { data: regionRms } = storeRow.region_id
    ? await admin.from('regional_users').select('user_id').eq('region_id', storeRow.region_id)
    : { data: [] as { user_id: string }[] }
  const currentRmId = (regionRms ?? [])[0]?.user_id ?? null

  // Store-manager contact details live on user_profiles via the store_users link.
  const { data: smLink } = await admin
    .from('store_users').select('user_id').eq('store_id', params.id).limit(1).maybeSingle()
  const { data: sm } = smLink?.user_id
    ? await admin.from('user_profiles').select('full_name, email, phone').eq('id', smLink.user_id).single()
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
          <h1 className="text-xl font-bold text-[var(--text)]">{store.company_name}</h1>
          <p className="text-sm text-[var(--text-muted)]">{store.sub_store}</p>
        </div>
      </div>

      {/* Store info */}
      <SectionCard title="Store Info">
        <div className="space-y-2">
          {store.full_name && (
            <div className="flex items-center gap-2 text-sm text-[var(--text)]">
              <Building2 size={14} className="text-[var(--text-faint)]" />
              <span>{store.full_name}</span>
            </div>
          )}
          {store.branch_code && (
            <div className="flex items-center gap-2 text-sm text-[var(--text)]">
              <span className="text-[var(--text-faint)] font-mono text-xs">CODE</span>
              <span className="font-mono font-semibold">{store.branch_code}</span>
            </div>
          )}
          {store.email && (
            <div className="flex items-center gap-2 text-sm text-[var(--text)]">
              <Mail size={14} className="text-[var(--text-faint)]" />
              <a href={`mailto:${store.email}`} className="hover:underline">{store.email}</a>
            </div>
          )}
          {store.phone && (
            <div className="flex items-center gap-2 text-sm text-[var(--text)]">
              <Phone size={14} className="text-[var(--text-faint)]" />
              <a href={`tel:${store.phone}`} className="hover:underline">{store.phone}</a>
            </div>
          )}
          {store.address && (
            <div className="flex items-center gap-2 text-sm text-[var(--text)]">
              <MapPin size={14} className="text-[var(--text-faint)]" />
              <MapLink address={store.address} className="hover:underline">{store.address}</MapLink>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Assign Regional Manager */}
      <AssignRMForm
        storeId={store.id}
        currentRmId={store.regional_manager_id}
        currentRmName={currentRm?.full_name ?? currentRm?.company_name ?? null}
        regionalManagers={regionalManagers ?? []}
      />

      {/* Tickets */}
      <div>
        <h2 className="font-semibold text-[var(--text)] mb-3">
          Tickets ({tickets?.length ?? 0})
        </h2>
        {!tickets?.length ? (
          <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
            <p className="text-sm text-[var(--text-faint)]">No tickets from this store yet.</p>
          </div>
        ) : (
          <Card className="overflow-hidden p-0">
            {(tickets as unknown as Ticket[]).map(ticket => (
              <Link
                key={ticket.id}
                href={`/supplier/tickets/${ticket.id}`}
                className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition"
              >
                <CategoryIcon category={ticket.category} priority={ticket.priority} className="h-11 w-11" iconSize={18} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-[var(--text)] truncate">{ticket.title}</p>
                  <p className="text-xs text-[var(--text-faint)] mt-0.5">{formatDate(ticket.created_at)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`inline-flex w-[92px] justify-center rounded-md px-2 py-1 text-[10px] font-bold ${PRIORITY_COLORS[ticket.priority]}`}>
                    {PRIORITY_LABELS[ticket.priority]}
                  </span>
                  <span className={`inline-flex w-[92px] justify-center rounded-md px-2 py-1 text-[10px] font-bold ${STATUS_COLORS[ticket.status]}`}>
                    {STATUS_LABELS[ticket.status]}
                  </span>
                </div>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
