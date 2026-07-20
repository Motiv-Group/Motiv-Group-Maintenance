import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { signedUrl, signManyUrls } from '@/lib/storage'
import { rmOwnsTicket } from '@/lib/rm-ticket-access'
import { loadSlaResolver } from '@/lib/health/data'
import type { Database } from '@/lib/database.types'

type PanelQuote = Pick<
  Database['public']['Tables']['quotes']['Row'],
  'id' | 'supplier_id' | 'amount' | 'amount_incl_vat' | 'description' | 'file_url' | 'status' | 'valid_until' | 'proposed_schedule_at' | 'created_at' | 'decline_reason'
>

// GET /api/tickets/[id]/quotes — the RM's quote-panel rows for a ticket (requested
// suppliers + any submitted quotes), used by the Today queue's "Approve quote" and
// "View & Assign" pop-ups. RM-scoped: the ticket must be in one of the caller's
// regions. Also returns a `ticket` detail summary (description, photos, impact) so
// the "View & Assign" pop-up can show the full context before assigning a supplier.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  if (me?.role !== 'regional_manager') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ticket } = await admin.from('tickets').select('id, company_id, region_id, store_id, status, title, category, description, operational_impact, priority, job_ref, photo_urls, created_at, resolution_due_at, adjusted_resolution_due_at').eq('id', id).single()
  if (!ticket || ticket.company_id !== me.company_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await rmOwnsTicket(admin, user.id, ticket))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ data: quotes }, { data: invites }] = await Promise.all([
    admin.from('quotes').select('id, supplier_id, amount, amount_incl_vat, description, file_url, status, valid_until, proposed_schedule_at, created_at, decline_reason').eq('ticket_id', id).order('created_at', { ascending: false }),
    admin.from('ticket_suppliers').select('supplier_id, status, invited_at, decline_reason, suppliers(company_name)').eq('ticket_id', id),
  ])

  // Sign the private quote attachments (each distinct url once).
  const signCache = new Map<string, Promise<string | null>>()
  const signOne = (u: string | null | undefined): Promise<string | null> => { if (!u) return Promise.resolve(null); let p = signCache.get(u); if (!p) { p = signedUrl(u); signCache.set(u, p) } return p }
  const quoteRows: PanelQuote[] = quotes ?? []
  await Promise.all(quoteRows.map(async q => { q.file_url = await signOne(q.file_url) }))

  const inviteRows = invites ?? []
  const nameById = new Map<string | null, string>()
  for (const inv of inviteRows) if (inv.suppliers?.company_name) nameById.set(inv.supplier_id, inv.suppliers.company_name)
  const missing = quoteRows.map(q => q.supplier_id).filter((sid): sid is string => !!sid && !nameById.has(sid))
  if (missing.length) { const { data: sups } = await admin.from('suppliers').select('id, company_name').in('id', missing); for (const s of sups ?? []) nameById.set(s.id, s.company_name) }

  const toPanelQuote = (q: PanelQuote) => ({ id: q.id, amount: q.amount, amountInclVat: q.amount_incl_vat ?? null, description: q.description ?? null, fileUrl: q.file_url ?? null, createdAt: q.created_at, validUntil: q.valid_until ?? null, proposedScheduleAt: q.proposed_schedule_at ?? null })
  const quoteBySupplier = new Map<string | null, { kind: 'received' | 'accepted' | 'declined'; q: PanelQuote }>()
  for (const q of quoteRows) {
    if (q.status === 'accepted') quoteBySupplier.set(q.supplier_id, { kind: 'accepted', q })
    else if (q.status === 'pending' && !quoteBySupplier.has(q.supplier_id)) quoteBySupplier.set(q.supplier_id, { kind: 'received', q })
    else if (q.status === 'declined' && !quoteBySupplier.has(q.supplier_id)) quoteBySupplier.set(q.supplier_id, { kind: 'declined', q })
  }

  type PanelRow = {
    supplierId: string | null
    name: string
    requestedAt: string | null
    kind: 'received' | 'accepted' | 'declined' | 'waiting'
    declineReason: string | null
    quote: ReturnType<typeof toPanelQuote> | null
  }
  const seen = new Set<string | null>()
  const rows: PanelRow[] = []
  for (const inv of inviteRows) {
    if (inv.status === 'closed' || seen.has(inv.supplier_id)) continue
    seen.add(inv.supplier_id)
    const qs = quoteBySupplier.get(inv.supplier_id)
    rows.push({ supplierId: inv.supplier_id, name: nameById.get(inv.supplier_id) ?? 'Supplier', requestedAt: inv.invited_at ?? null, kind: qs?.kind ?? (inv.status === 'declined' ? 'declined' : 'waiting'), declineReason: inv.decline_reason ?? qs?.q?.decline_reason ?? null, quote: qs ? toPanelQuote(qs.q) : null })
  }
  for (const [sid, qs] of quoteBySupplier) if (!seen.has(sid)) rows.push({ supplierId: sid, name: nameById.get(sid) ?? 'Supplier', requestedAt: qs.q.created_at, kind: qs.kind, declineReason: qs.q.decline_reason ?? null, quote: toPanelQuote(qs.q) })

  const canReQuote = !quoteRows.some(q => q.status === 'accepted')
    && ['open', 'info_requested', 'assigned', 'assessment', 'quote_requested', 'quoted', 'quote_revision', 'suppliers_declined'].includes(ticket.status)

  // Ticket detail summary for the "View & Assign" pop-up — store name + signed
  // photos so the RM can review the job before assigning suppliers.
  const { data: store } = ticket.store_id
    ? await admin.from('stores').select('name').eq('id', ticket.store_id).maybeSingle()
    : { data: null }
  const photoUrls = Array.isArray(ticket.photo_urls) && ticket.photo_urls.length ? await signManyUrls(ticket.photo_urls) : []
  // "Due" = the resolution SLA target: the stamped columns when set (fresh tickets
  // have neither yet), else created_at + the company's resolution rule — mirrors
  // the health engine's fallback so the pop-up never shows a blank Due.
  let dueAt: string | null = ticket.adjusted_resolution_due_at ?? ticket.resolution_due_at ?? null
  if (!dueAt) {
    const rules = await loadSlaResolver(admin, ticket.company_id)
    const tgt = rules(ticket.priority as 'P1' | 'P2' | 'P3' | 'P4')
    dueAt = new Date(new Date(ticket.created_at).getTime() + tgt.resolution_mins * 60_000).toISOString()
  }
  const ticketDetail = {
    title: ticket.title, category: ticket.category ?? null, description: ticket.description ?? '',
    operationalImpact: ticket.operational_impact ?? null, priority: ticket.priority ?? null,
    jobRef: ticket.job_ref ?? null, storeName: store?.name ?? null, photoUrls,
    createdAt: ticket.created_at, dueAt,
  }

  return NextResponse.json({ rows, canReQuote, ticket: ticketDetail })
}
