import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { signedUrl } from '@/lib/storage'
import { rmOwnsTicket } from '@/lib/rm-ticket-access'

// GET /api/tickets/[id]/quotes — the RM's quote-panel rows for a ticket (requested
// suppliers + any submitted quotes), used by the Today queue's "Approve quote"
// pop-up. RM-scoped: the ticket must be in one of the caller's regions.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  if (me?.role !== 'regional_manager') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ticket } = await admin.from('tickets').select('id, company_id, region_id, store_id, status').eq('id', id).single()
  if (!ticket || ticket.company_id !== me.company_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await rmOwnsTicket(admin, user.id, ticket))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ data: quotes }, { data: invites }] = await Promise.all([
    admin.from('quotes').select('id, supplier_id, amount, amount_incl_vat, description, file_url, status, valid_until, proposed_schedule_at, created_at, decline_reason').eq('ticket_id', id).order('created_at', { ascending: false }),
    admin.from('ticket_suppliers').select('supplier_id, status, invited_at, decline_reason, suppliers(company_name)').eq('ticket_id', id),
  ])

  // Sign the private quote attachments (each distinct url once).
  const signCache = new Map<string, Promise<string | null>>()
  const signOne = (u: string | null | undefined): Promise<string | null> => { if (!u) return Promise.resolve(null); let p = signCache.get(u); if (!p) { p = signedUrl(u); signCache.set(u, p) } return p }
  await Promise.all(((quotes ?? []) as any[]).map(async q => { q.file_url = await signOne(q.file_url) }))

  const nameById = new Map<string, string>()
  for (const inv of (invites ?? []) as any[]) if (inv.suppliers?.company_name) nameById.set(inv.supplier_id, inv.suppliers.company_name)
  const missing = ((quotes ?? []) as any[]).map(q => q.supplier_id).filter((sid: string) => sid && !nameById.has(sid))
  if (missing.length) { const { data: sups } = await admin.from('suppliers').select('id, company_name').in('id', missing); for (const s of (sups ?? []) as any[]) nameById.set(s.id, s.company_name) }

  const toPanelQuote = (q: any) => ({ id: q.id, amount: q.amount, amountInclVat: q.amount_incl_vat ?? null, description: q.description ?? null, fileUrl: q.file_url ?? null, createdAt: q.created_at, validUntil: q.valid_until ?? null, proposedScheduleAt: q.proposed_schedule_at ?? null })
  const quoteBySupplier = new Map<string, { kind: 'received' | 'accepted' | 'declined'; q: any }>()
  for (const q of (quotes ?? []) as any[]) {
    if (q.status === 'accepted') quoteBySupplier.set(q.supplier_id, { kind: 'accepted', q })
    else if (q.status === 'pending' && !quoteBySupplier.has(q.supplier_id)) quoteBySupplier.set(q.supplier_id, { kind: 'received', q })
    else if (q.status === 'declined' && !quoteBySupplier.has(q.supplier_id)) quoteBySupplier.set(q.supplier_id, { kind: 'declined', q })
  }

  const seen = new Set<string>()
  const rows: any[] = []
  for (const inv of (invites ?? []) as any[]) {
    if (inv.status === 'closed' || seen.has(inv.supplier_id)) continue
    seen.add(inv.supplier_id)
    const qs = quoteBySupplier.get(inv.supplier_id)
    rows.push({ supplierId: inv.supplier_id, name: nameById.get(inv.supplier_id) ?? 'Supplier', requestedAt: inv.invited_at ?? null, kind: qs?.kind ?? (inv.status === 'declined' ? 'declined' : 'waiting'), declineReason: inv.decline_reason ?? qs?.q?.decline_reason ?? null, quote: qs ? toPanelQuote(qs.q) : null })
  }
  for (const [sid, qs] of quoteBySupplier) if (!seen.has(sid)) rows.push({ supplierId: sid, name: nameById.get(sid) ?? 'Supplier', requestedAt: qs.q.created_at, kind: qs.kind, declineReason: qs.q.decline_reason ?? null, quote: toPanelQuote(qs.q) })

  const canReQuote = !((quotes ?? []) as any[]).some(q => q.status === 'accepted')
    && ['open', 'info_requested', 'assigned', 'assessment', 'quote_requested', 'quoted', 'quote_revision', 'suppliers_declined'].includes(ticket.status)

  return NextResponse.json({ rows, canReQuote })
}
