import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'

// POST /api/tickets/[id]/submit-quote — an invited supplier submits (or resubmits)
// their quote. Records the quote, marks their ticket_suppliers row 'quoted', and
// moves the ticket to "quoted" so the RM can review/award.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!rateLimit(`submit-quote:${user.id}`, 30, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json().catch(() => ({}))
  const amount = Number(body.amount)
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Enter a valid quote amount.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id, full_name').eq('id', user.id).single()
  if (prof?.role !== 'supplier') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ticket } = await admin.from('tickets').select('*').eq('id', params.id).single()
  if (!ticket || ticket.company_id !== prof.company_id) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  // Which of the caller's supplier companies is invited on this ticket?
  const { data: myLinks } = await admin.from('supplier_users').select('supplier_id').eq('user_id', user.id)
  const mySupplierIds = (myLinks ?? []).map(l => l.supplier_id)
  const { data: invite } = await admin.from('ticket_suppliers').select('id, supplier_id, status').eq('ticket_id', ticket.id).in('supplier_id', mySupplierIds.length ? mySupplierIds : ['00000000-0000-0000-0000-000000000000']).maybeSingle()
  if (!invite) return NextResponse.json({ error: 'You are not invited to quote on this ticket.' }, { status: 403 })
  if (['awarded', 'closed', 'declined'].includes(invite.status)) return NextResponse.json({ error: 'This invitation is closed.' }, { status: 400 })

  const now = new Date().toISOString()
  // Optional proposed start date/time — used to auto-schedule the job on approval.
  const proposedSchedule = body.proposed_schedule_at ? new Date(body.proposed_schedule_at) : null
  const proposed_schedule_at = proposedSchedule && !Number.isNaN(proposedSchedule.getTime()) ? proposedSchedule.toISOString() : null
  const { data: quote, error: qErr } = await admin.from('quotes').insert({
    company_id: ticket.company_id, ticket_id: ticket.id, supplier_id: invite.supplier_id, submitted_by: user.id,
    amount, amount_incl_vat: body.amount_incl_vat ?? null, file_url: body.file_url ?? null, status: 'pending',
    description: body.description ?? null, valid_until: body.valid_until ?? null, warranty: body.warranty ?? null, proposed_schedule_at,
  }).select('id').single()
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  await admin.from('ticket_suppliers').update({ status: 'quoted', quote_id: quote.id, responded_at: now }).eq('id', invite.id)
  await admin.from('tickets').update({
    status: 'quoted', quote_submitted_at: now, quote_value: amount, quote_decision_required: true, quote_decision_status: 'pending',
    current_blocker: 'quote_approval', blocker_owner_type: 'regional_manager', blocker_started_at: now, sla_paused: true,
    last_supplier_update_at: now, updated_at: now,
  }).eq('id', ticket.id)

  // Notify the region's managers.
  if (ticket.region_id) {
    const { data: rms } = await admin.from('regional_users').select('user_id').eq('region_id', ticket.region_id)
    const ids = (rms ?? []).map(r => r.user_id)
    if (ids.length) {
      await admin.from('notifications').insert(ids.map(id => ({ company_id: ticket.company_id, user_id: id, type: 'ticket_update', title: `Ticket: ${ticket.title ?? 'Untitled'}`, message: 'A quote was submitted for review.', link: `/regional/tickets/${ticket.id}` })))
      void sendPushToMany(ids, { title: 'Quote submitted', body: ticket.title ?? 'A quote needs review', url: `/regional/tickets/${ticket.id}` })
    }
  }

  revalidatePath('/supplier'); revalidatePath(`/supplier/tickets/${ticket.id}`); revalidatePath('/regional'); revalidatePath(`/regional/tickets/${ticket.id}`)
  return NextResponse.json({ ok: true })
}
