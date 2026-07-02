import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'
import { loadSlaResolver } from '@/lib/health/data'

// POST /api/tickets/[id]/quote-decision — RM approves or declines a supplier's quote.
//  approve: award that supplier (others auto-close), ticket → accepted.
//  decline: decline that one quote (with reason) and re-open the ticket so the RM
//           can pick one of the remaining quotes OR assign a different supplier.
//           Remaining suppliers' quotes are left pending (still selectable).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!rateLimit(`quote-decision:${user.id}`, 40, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json().catch(() => ({}))
  const action = ['approve', 'decline', 'requote'].includes(body.action) ? body.action as 'approve' | 'decline' | 'requote' : null
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

  const { data: quote } = await admin.from('quotes').select('id, supplier_id, status, proposed_schedule_at').eq('id', quoteId).eq('ticket_id', ticket.id).single()
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  const now = new Date().toISOString()

  const reason = body.reason ?? null
  const { data: su } = await admin.from('supplier_users').select('user_id').eq('supplier_id', quote.supplier_id)
  const ids = (su ?? []).map(r => r.user_id)
  const notify = async (message: string, pushTitle: string) => {
    if (!ids.length) return
    await admin.from('notifications').insert(ids.map(id => ({ company_id: ticket.company_id, user_id: id, type: 'ticket_update', title: `Ticket: ${ticket.title ?? 'Untitled'}`, message, link: `/supplier/tickets/${ticket.id}` })))
    void sendPushToMany(ids, { title: pushTitle, body: ticket.title ?? '', url: `/supplier/tickets/${ticket.id}` })
  }

  if (action === 'decline') {
    // Decline this supplier's quote WITHOUT auto-asking for a revised one. The
    // supplier is notified with the reason and taken off the ticket (invite
    // 'declined', by the RM) — they can't re-submit until the RM explicitly
    // presses "Ask to re-quote" (the 'requote' action below).
    await admin.from('quotes').update({ status: 'declined' }).eq('id', quote.id)
    await admin.from('ticket_suppliers').update({ status: 'declined', decline_reason: reason, declined_by: 'regional_manager', responded_at: now }).eq('ticket_id', ticket.id).eq('supplier_id', quote.supplier_id)
    // Decide the ticket's next state from what's left on it:
    //  • another quote still pending      → 'quoted'          (keep reviewing)
    //  • every invited supplier now off it → 'open'           (RM must re-assign)
    //  • otherwise                         → 'quote_requested'(await the remaining invitees)
    // The 'open' case mirrors the supplier-side decline flow: once ALL suppliers are
    // off the ticket — whether the RM declined their quote or they declined the
    // request themselves — it returns to Open (a ticket is open until completed).
    const { data: pend } = await admin.from('quotes').select('id').eq('ticket_id', ticket.id).eq('status', 'pending')
    const hasPending = (pend ?? []).length > 0
    const { data: allInvites } = await admin.from('ticket_suppliers').select('status').eq('ticket_id', ticket.id)
    const allDeclined = !hasPending && (allInvites ?? []).length > 0 && (allInvites ?? []).every(i => ['declined', 'closed'].includes(i.status))
    const stateFields = hasPending
      ? { status: 'quoted', quote_required: true, quote_decision_required: true, quote_decision_status: 'pending',
          current_blocker: 'quote_approval', blocker_owner_type: 'regional_manager', blocker_started_at: now,
          sla_paused: true, pause_reason: 'awaiting_decision', pause_started_at: now }
      : allDeclined
      ? { status: 'open', quote_required: false, quote_decision_required: false, quote_decision_status: null,
          current_blocker: null, blocker_owner_type: null, blocker_started_at: null, sla_paused: false, pause_ended_at: now }
      : { status: 'quote_requested', quote_required: true, quote_decision_required: false, quote_decision_status: null,
          current_blocker: 'supplier_action', blocker_owner_type: 'supplier', blocker_started_at: now, sla_paused: false, pause_ended_at: now }
    await admin.from('tickets').update({
      ...stateFields, supplier_id: null, last_internal_update_at: now, updated_at: now,
    }).eq('id', ticket.id)
    const supplierMsg = reason
      ? `Your quote was declined — ${reason}.`
      : 'Thank you for your submission. Although your quotation was not selected for this request, we value your participation and look forward to inviting you to future opportunities.'
    await notify(supplierMsg, 'Quote declined')
    revalidatePath('/regional'); revalidatePath(`/regional/tickets/${ticket.id}`); revalidatePath('/supplier'); revalidatePath(`/supplier/tickets/${ticket.id}`)
    return NextResponse.json({ ok: true })
  }

  if (action === 'requote') {
    // Ask the (previously declined) supplier to submit a revised quote — re-invite
    // them and stamp requote_requested_at so their page shows the re-quote prompt.
    const rules = await loadSlaResolver(admin, ticket.company_id)
    const quoteDueAt = new Date(Date.now() + rules(ticket.priority as 'P1' | 'P2' | 'P3' | 'P4').quote_due_mins * 60_000).toISOString()
    await admin.from('ticket_suppliers').update({ status: 'invited', declined_by: null, requote_requested_at: now, responded_at: now }).eq('ticket_id', ticket.id).eq('supplier_id', quote.supplier_id)
    await admin.from('tickets').update({
      status: 'quote_requested', supplier_id: null, quote_required: true, quote_requested_at: now, quote_due_at: quoteDueAt,
      // Set-once: keep the FIRST quote request in the audit trail.
      first_quote_requested_at: (ticket as any).first_quote_requested_at ?? now,
      quote_decision_required: false, quote_decision_status: null,
      current_blocker: 'supplier_action', blocker_owner_type: 'supplier', blocker_started_at: now, sla_paused: false,
      last_internal_update_at: now, updated_at: now,
    }).eq('id', ticket.id)
    await notify('You have been asked to submit a revised quote.', 'Revise your quote')
    revalidatePath('/regional'); revalidatePath(`/regional/tickets/${ticket.id}`); revalidatePath('/supplier')
    return NextResponse.json({ ok: true })
  }

  // approve → award this supplier; auto-close the rest.
  await admin.from('quotes').update({ status: 'accepted' }).eq('id', quote.id)
  await admin.from('quotes').update({ status: 'declined' }).eq('ticket_id', ticket.id).eq('status', 'pending').neq('id', quote.id)
  await admin.from('ticket_suppliers').update({ status: 'awarded', responded_at: now }).eq('ticket_id', ticket.id).eq('supplier_id', quote.supplier_id)
  await admin.from('ticket_suppliers').update({ status: 'closed', responded_at: now }).eq('ticket_id', ticket.id).neq('supplier_id', quote.supplier_id).in('status', ['invited', 'quoted'])
  // If the supplier proposed a start date on the quote, schedule straight to it
  // (skip the separate "schedule the job" step); otherwise land on 'accepted'.
  const proposedAt = (quote as any).proposed_schedule_at as string | null
  const scheduled = !!proposedAt && new Date(proposedAt).getTime() > 0
  await admin.from('tickets').update({
    status: scheduled ? 'scheduled' : 'accepted', supplier_id: quote.supplier_id, quote_value: (ticket.quote_value ?? null),
    ...(scheduled ? { scheduled_at: proposedAt } : {}),
    quote_decision_required: false, quote_decision_status: 'approved', quote_decided_at: now,
    current_blocker: 'supplier_action', blocker_owner_type: 'supplier', blocker_started_at: now, sla_paused: false, pause_ended_at: now,
    last_internal_update_at: now, updated_at: now,
  }).eq('id', ticket.id)

  // Notify the winning supplier (su/ids already resolved for this quote's supplier) + the store.
  await notify('Your quote was approved — you can proceed.', 'Quote approved')
  if (ticket.created_by) {
    await admin.from('notifications').insert([{ company_id: ticket.company_id, user_id: ticket.created_by, type: 'ticket_update', title: `Ticket: ${ticket.title ?? 'Untitled'}`, message: 'Work approved — a supplier has been assigned.', link: `/client/tickets/${ticket.id}` }])
    void sendPushToMany([ticket.created_by], { title: 'Work approved', body: ticket.title ?? '', url: `/client/tickets/${ticket.id}` })
  }

  revalidatePath('/regional'); revalidatePath(`/regional/tickets/${ticket.id}`); revalidatePath('/supplier'); revalidatePath('/client')
  return NextResponse.json({ ok: true })
}
