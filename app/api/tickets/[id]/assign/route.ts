import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'
import { loadSlaResolver } from '@/lib/health/data'

// POST /api/tickets/[id]/assign — RM invites one or more suppliers to quote.
// Creates ticket_suppliers rows (invited), moves the ticket to "assigned", and
// notifies every invited supplier. The winner is chosen later via /quote-decision.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!rateLimit(`assign:${user.id}`, 30, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json().catch(() => ({}))
  const supplierIds: string[] = Array.isArray(body.supplierIds) ? body.supplierIds.filter((s: unknown) => typeof s === 'string') : []
  if (!supplierIds.length) return NextResponse.json({ error: 'Select at least one supplier.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id, full_name').eq('id', user.id).single()
  if (!prof?.company_id || (prof.role !== 'regional_manager' && prof.role !== 'executive')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ticket } = await admin.from('tickets').select('*').eq('id', params.id).single()
  if (!ticket || ticket.company_id !== prof.company_id) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  if (prof.role === 'regional_manager') {
    const { data: links } = await admin.from('regional_users').select('region_id').eq('user_id', user.id)
    if (!ticket.region_id || !(links ?? []).some(l => l.region_id === ticket.region_id)) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  }
  if (!['open', 'info_requested', 'assigned'].includes(ticket.status)) {
    return NextResponse.json({ error: 'Suppliers can only be assigned before a quote is approved.' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const rules = await loadSlaResolver(admin, ticket.company_id)
  const tgt = rules(ticket.priority as 'P1' | 'P2' | 'P3' | 'P4')
  const quoteDueAt = new Date(Date.now() + tgt.quote_due_mins * 60_000).toISOString()

  // Invite each supplier (idempotent on re-assign).
  const rows = supplierIds.map(supplier_id => ({ company_id: ticket.company_id, ticket_id: ticket.id, supplier_id, status: 'invited', invited_at: now }))
  const { error: insErr } = await admin.from('ticket_suppliers').upsert(rows, { onConflict: 'ticket_id,supplier_id', ignoreDuplicates: true })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  await admin.from('tickets').update({
    status: 'assigned', supplier_id: null, quote_required: true, quote_requested_at: now, quote_due_at: quoteDueAt,
    current_blocker: 'supplier_action', blocker_owner_type: 'supplier', blocker_started_at: now, sla_paused: false,
    last_internal_update_at: now, updated_at: now,
  }).eq('id', ticket.id)

  // Notify the invited suppliers.
  const { data: su } = await admin.from('supplier_users').select('user_id, supplier_id').in('supplier_id', supplierIds)
  const ids = Array.from(new Set((su ?? []).map(r => r.user_id)))
  if (ids.length) {
    await admin.from('notifications').insert(ids.map(id => ({ company_id: ticket.company_id, user_id: id, type: 'ticket_update', title: `Ticket: ${ticket.title ?? 'Untitled'}`, message: 'You have been invited to quote.', link: `/supplier/tickets/${ticket.id}` })))
    void sendPushToMany(ids, { title: 'New quote request', body: ticket.title ?? 'A ticket needs your quote', url: `/supplier/tickets/${ticket.id}` })
  }

  revalidatePath('/regional'); revalidatePath('/regional/tickets'); revalidatePath(`/regional/tickets/${ticket.id}`); revalidatePath('/supplier')
  return NextResponse.json({ ok: true })
}
