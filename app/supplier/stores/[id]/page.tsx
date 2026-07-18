import { createClient, createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { Mail, Phone, MapPin, Building2 } from 'lucide-react'
import { Card, SectionCard } from '@/components/exec/ui'
import { CategoryIcon } from '@/components/client/ticketBadges'
import { MapLink } from '@/components/ui/MapLink'
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
  if (!user) notFound()

  // Use the admin client scoped to the caller's company: a supplier has no RLS
  // grant to read `stores`, so the user client would 404 the page. Tenant safety
  // is enforced by the company_id check below (admin bypasses RLS).
  const admin = createAdminClient()
  const { data: prof } = user
    ? await admin.from('user_profiles').select('company_id').eq('id', user.id).single()
    : { data: null }
  const companyId = prof?.company_id ?? null

  // v3: the store lives on `stores`.
  const [{ data: storeRow }, { data: allTickets }, { data: supplierLinks }] = await Promise.all([
    admin
      .from('stores')
      .select('id, name, sub_store, branch_code, address, region_id, company_id')
      .eq('id', params.id)
      .single(),
    admin
      .from('tickets')
      .select('*')
      .eq('store_id', params.id)
      .order('created_at', { ascending: false }),
    admin.from('supplier_users').select('supplier_id').eq('user_id', user.id),
  ])

  // Tenant guard — the store must belong to the caller's company.
  if (!storeRow || !companyId || storeRow.company_id !== companyId) notFound()

  // Suppliers compete: only show tickets this supplier was awarded or invited to
  // quote on (mirrors the gate on the ticket detail page) — never the whole
  // store history, which would leak other suppliers' work.
  const supplierIds = (supplierLinks ?? []).map(l => l.supplier_id)
  const { data: inviteRows } = supplierIds.length
    ? await admin.from('ticket_suppliers').select('ticket_id').in('supplier_id', supplierIds)
    : { data: [] as { ticket_id: string }[] }
  const invitedIds = new Set((inviteRows ?? []).map(r => r.ticket_id))
  const tickets = (allTickets ?? []).filter(
    t => (t.supplier_id && supplierIds.includes(t.supplier_id)) || invitedIds.has(t.id)
  )

  // ── Supplier-visibility gate (cross-supplier isolation) ──────────────────
  // Suppliers are COMPETING OUTSIDERS inside one company: this page must only
  // exist for a supplier ENGAGED with the store — at least one ticket here
  // awarded to them or carrying a quote invite for them. Anything else 404s
  // like a non-existent store, so an unengaged supplier can't even confirm
  // the store exists (existence leak = competitor intel).
  if (!tickets.length) notFound()
  const hasAwarded = tickets.some(t => t.supplier_id && supplierIds.includes(t.supplier_id))

  // Store-manager contact details live on user_profiles via the store_users
  // link — but the SM's PII (name/email/phone) is only fetched once the
  // supplier has an AWARDED ticket at this store. An invited-only supplier
  // needs the site (name/branch/address) to quote, not the store manager's
  // personal contact details.
  const { data: smLink } = hasAwarded
    ? await admin
        .from('store_users').select('user_id').eq('store_id', params.id).limit(1).maybeSingle()
    : { data: null }
  const { data: sm } = smLink?.user_id
    ? await admin.from('user_profiles').select('full_name, email, phone').eq('id', smLink.user_id).single()
    : { data: null as { full_name?: string | null; email?: string | null; phone?: string | null } | null }

  const store = {
    ...storeRow,
    company_name: storeRow.name,
    full_name: sm?.full_name ?? null,
    email: sm?.email ?? null,
    phone: sm?.phone ?? null,
  }

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
          {!hasAwarded && (
            <p className="text-xs italic text-[var(--text-faint)]">
              Store contact details unlock once work here is awarded to you.
            </p>
          )}
        </div>
      </SectionCard>

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
                  <span className={`inline-flex w-auto sm:w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${PRIORITY_COLORS[ticket.priority]}`}>
                    {PRIORITY_LABELS[ticket.priority]}
                  </span>
                  <span className={`inline-flex w-auto sm:w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${STATUS_COLORS[ticket.status]}`}>
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
