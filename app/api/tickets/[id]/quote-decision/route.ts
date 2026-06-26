import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'

// POST /api/tickets/[id]/quote-decision — RM approves or declines a supplier's quote.
//  approve: award that supplier (others auto-close), ticket → accepted.
//  decline: decline that one quote (with reason); the ticket stays open for the
//           remaining suppliers' quotes.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!rateLimit(`quote-decision:${user.id}`, 40, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json().catch(() => ({}))
  const action = body.action === 'approve' ? 'approve' : body.action === 'decline' ? 'decline' : null
  const quoteId = typeof body.quoteId === 'string' ? body.quoteId : null
  if (!action || !quoteId) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id, full_name').eq('id', user.id).single()
  if (!prof?.company_id || (prof.role !== 'regional_manager' && prof.role !== 'executive')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ticket } = await admin.from('tickets').select('*').eq('id', params.id).single()
  if (!ticket || ticket.company_id !== prof.company_id) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  if (prof.role === 'regional_manager') {
    const { data: links } = await admin.from('regional_users').select('region_id').eq('user_id', user.id)
    if (!ticket.region_id || !(links ?? []).some(l => l.region_id === ticket.region_id)) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  }

  const { data: quote } = await admin.from('quotes').select('id, supplier_id, status').eq('id', quoteId).eq('ticket_id', ticket.id).single()
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  const now = new Date().toISOString()

  if (action === 'decline') {
    await admin.from('quotes').update({ status: 'declined' }).eq('id', quote.id)
    await admin.from('ticket_suppliers').update({ status: 'declined', decline_reason: body.reason ?? null, responded_at: now }).eq('ticket_id', ticket.id).eq('supplier_id', quote.supplier_id)
    await admin.from('tickets').update({ last_internal_update_at: now, updated_at: now }).eq('id', ticket.id)
    // Notify the declined supplier.
    const { data: su } = await admin.from('supplier_users').select('user_id').eq('supplier_id', quote.supplier_id)
    const ids = (su ?? []).map(r => r.user_id)
    if (ids.length) {
      await admin.from('notifications').insert(ids.map(id => ({ company_id: ticket.company_id, user_id: id, type: 'ticket_update', title: `Ticket: ${ticket.title ?? 'Untitled'}`, message: 'Your quote was declined.', link: `/supplier/tickets/${ticket.id}` })))
      void sendPushToMany(ids, { title: 'Quote declined', body: ticket.title ?? '', url: `/supplier/tickets/${ticket.id}` })
    }
    revalidatePath('/regional'); revalidatePath(`/regional/tickets/${ticket.id}`); revalidatePath('/supplier')
    return NextResponse.json({ ok: true })
  }

  // approve → award this supplier; auto-close the rest.
  await admin.from('quotes').update({ status: 'accepted' }).eq('id', quote.id)
  await admin.from('quotes').update({ status: 'declined' }).eq('ticket_id', ticket.id).eq('status', 'pending').neq('id', quote.id)
  await admin.from('ticket_suppliers').update({ status: 'awarded', responded_at: now }).eq('ticket_id', ticket.id).eq('supplier_id', quote.supplier_id)
  await admin.from('ticket_suppliers').update({ status: 'closed', responded_at: now }).eq('ticket_id', ticket.id).neq('supplier_id', quote.supplier_id).in('status', ['invited', 'quoted'])
  await admin.from('tickets').update({
    status: 'accepted', supplier_id: quote.supplier_id, quote_value: (ticket.quote_value ?? null),
    quote_decision_required: false, quote_decision_status: 'approved', quote_decided_at: now,
    current_blocker: 'supplier_action', blocker_owner_type: 'supplier', blocker_started_at: now, sla_paused: false, pause_ended_at: now,
    last_internal_update_at: now, updated_at: now,
  }).eq('id', ticket.id)

  // Notify the winning supplier + the store.
  const { data: su } = await admin.from('supplier_users').select('user_id').eq('supplier_id', quote.supplier_id)
  const ids = (su ?? []).map(r => r.user_id)
  if (ids.length) {
    await admin.from('notifications').insert(ids.map(id => ({ company_id: ticket.company_id, user_id: id, type: 'ticket_update', title: `Ticket: ${ticket.title ?? 'Untitled'}`, message: 'Your quote was approved — you can proceed.', link: `/supplier/tickets/${ticket.id}` })))
    void sendPushToMany(ids, { title: 'Quote approved', body: ticket.title ?? '', url: `/supplier/tickets/${ticket.id}` })
  }
  if (ticket.created_by) {
    await admin.from('notifications').insert([{ company_id: ticket.company_id, user_id: ticket.created_by, type: 'ticket_update', title: `Ticket: ${ticket.title ?? 'Untitled'}`, message: 'Work approved — a supplier has been assigned.', link: `/client/tickets/${ticket.id}` }])
    void sendPushToMany([ticket.created_by], { title: 'Work approved', body: ticket.title ?? '', url: `/client/tickets/${ticket.id}` })
  }

  revalidatePath('/regional'); revalidatePath(`/regional/tickets/${ticket.id}`); revalidatePath('/supplier'); revalidatePath('/client')
  return NextResponse.json({ ok: true })
}
