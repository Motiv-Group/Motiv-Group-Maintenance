import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'

type Admin = ReturnType<typeof createAdminClient>

async function push(admin: Admin, ids: string[], companyId: string, title: string, message: string, link: string) {
  if (!ids.length) return
  await admin.from('notifications').insert(ids.map(id => ({ company_id: companyId, user_id: id, type: 'ticket_update', title, message, link })))
  void sendPushToMany(ids, { title, body: message, url: link })
}
async function regionIds(admin: Admin, regionId: string | null): Promise<string[]> {
  if (!regionId) return []
  const { data } = await admin.from('regional_users').select('user_id').eq('region_id', regionId)
  return (data ?? []).map(r => r.user_id)
}
async function supplierIds(admin: Admin, supplierId: string | null): Promise<string[]> {
  if (!supplierId) return []
  const { data } = await admin.from('supplier_users').select('user_id').eq('supplier_id', supplierId)
  return (data ?? []).map(r => r.user_id)
}
function cleanUrls(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && u.length > 0).slice(0, 10) : []
}

// POST /api/tickets/:id/dispute  { action: 'raise' | 'reply' | 'resolve', ... }
// Supplier↔RM dispute thread over a snag or a "more evidence" request. A dispute
// pauses the snag/evidence step (enforced in the transition route) until the RM
// resolves it as 'upheld' (requirement stands) or 'withdrawn' (dropped → close-out).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!rateLimit(`dispute:${user.id}`, 40, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const ticketId = params.id
  const body = await request.json().catch(() => ({}))
  const action = String(body.action ?? '')

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  const role = prof?.role
  if (!role || !prof?.company_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const actingRole: 'supplier' | 'regional_manager' | null =
    role === 'supplier' ? 'supplier' : (role === 'regional_manager' || role === 'executive') ? 'regional_manager' : null
  if (!actingRole) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ticket } = await admin.from('tickets').select('*').eq('id', ticketId).single()
  if (!ticket || ticket.company_id !== prof.company_id) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  // Access: the awarded supplier's users, or an RM of the ticket's region.
  if (actingRole === 'supplier') {
    const mine = await supplierIds(admin, ticket.supplier_id)
    if (!mine.includes(user.id)) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  } else {
    const rms = await regionIds(admin, ticket.region_id)
    if (!rms.includes(user.id)) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  }

  const now = new Date().toISOString()
  const { data: openDispute } = await admin.from('ticket_disputes').select('*').eq('ticket_id', ticketId).eq('status', 'open').maybeSingle()
  const title = `Ticket: ${ticket.title ?? 'Untitled'}`

  if (action === 'raise') {
    if (actingRole !== 'supplier') return NextResponse.json({ error: 'Only the supplier can raise a dispute.' }, { status: 403 })
    if (!['snag', 'evidence_requested'].includes(ticket.status)) return NextResponse.json({ error: 'A dispute can only be raised on a snag or an evidence request.' }, { status: 400 })
    if (openDispute) return NextResponse.json({ error: 'A dispute is already open on this ticket.' }, { status: 409 })
    const messageBody = String(body.body ?? '').trim()
    const evidence = cleanUrls(body.evidenceUrls)
    if (!messageBody && !evidence.length) return NextResponse.json({ error: 'Add a message or attach evidence.' }, { status: 400 })
    const { data: disp, error } = await admin.from('ticket_disputes')
      .insert({ company_id: ticket.company_id, ticket_id: ticketId, origin: ticket.status === 'snag' ? 'snag' : 'evidence_requested', status: 'open', raised_by: user.id, created_at: now })
      .select('id').single()
    if (error || !disp) return NextResponse.json({ error: 'Could not raise the dispute.' }, { status: 500 })
    await admin.from('ticket_dispute_messages').insert({ dispute_id: disp.id, ticket_id: ticketId, author_id: user.id, author_role: 'supplier', body: messageBody || null, evidence_urls: evidence, created_at: now })
    await admin.from('tickets').update({ last_supplier_update_at: now, updated_at: now }).eq('id', ticketId)
    await push(admin, await regionIds(admin, ticket.region_id), ticket.company_id, title, 'The supplier has raised a dispute — review and respond.', `/regional/tickets/${ticketId}`)
  } else if (action === 'reply') {
    if (!openDispute) return NextResponse.json({ error: 'No open dispute on this ticket.' }, { status: 409 })
    const messageBody = String(body.body ?? '').trim()
    const evidence = cleanUrls(body.evidenceUrls)
    if (!messageBody && !evidence.length) return NextResponse.json({ error: 'Add a message or attach evidence.' }, { status: 400 })
    await admin.from('ticket_dispute_messages').insert({ dispute_id: openDispute.id, ticket_id: ticketId, author_id: user.id, author_role: actingRole, body: messageBody || null, evidence_urls: evidence, created_at: now })
    if (actingRole === 'supplier') {
      await admin.from('tickets').update({ last_supplier_update_at: now }).eq('id', ticketId)
      await push(admin, await regionIds(admin, ticket.region_id), ticket.company_id, title, 'New reply on the dispute.', `/regional/tickets/${ticketId}`)
    } else {
      await push(admin, await supplierIds(admin, ticket.supplier_id), ticket.company_id, title, 'The manager replied on your dispute.', `/supplier/tickets/${ticketId}`)
    }
  } else if (action === 'resolve') {
    if (actingRole !== 'regional_manager') return NextResponse.json({ error: 'Only the manager can resolve a dispute.' }, { status: 403 })
    if (!openDispute) return NextResponse.json({ error: 'No open dispute on this ticket.' }, { status: 409 })
    const outcome = body.outcome === 'withdrawn' ? 'withdrawn' : body.outcome === 'upheld' ? 'upheld' : null
    if (!outcome) return NextResponse.json({ error: 'Choose an outcome (uphold or withdraw).' }, { status: 400 })
    const note = String(body.note ?? '').trim() || null
    const isSnag = openDispute.origin === 'snag'
    await admin.from('ticket_disputes').update({ status: 'resolved', outcome, resolved_by: user.id, resolved_at: now, resolution_note: note }).eq('id', openDispute.id)
    // Closing summary message so the outcome is captured in the thread history.
    const outcomeLabel = outcome === 'withdrawn'
      ? (isSnag ? 'Snag withdrawn' : 'Evidence request withdrawn')
      : (isSnag ? 'Snag upheld' : 'Evidence request upheld')
    await admin.from('ticket_dispute_messages').insert({ dispute_id: openDispute.id, ticket_id: ticketId, author_id: user.id, author_role: 'regional_manager', body: `Dispute resolved — ${outcomeLabel}${note ? `: ${note}` : '.'}`, evidence_urls: [], created_at: now })
    if (outcome === 'withdrawn') {
      // The snag / evidence request is dropped — accept the latest submission and
      // move the job to the close-out stage (the RM still does the final close-out).
      const { data: latest } = await admin.from('signoffs').select('id').eq('ticket_id', ticketId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if ((latest as any)?.id) await admin.from('signoffs').update({ status: 'accepted', reviewed_by: user.id, reviewed_at: now }).eq('id', (latest as any).id)
      await admin.from('snags').update({ status: 'resolved' }).eq('ticket_id', ticketId).in('status', ['open', 'assigned', 'in_progress'])
      await admin.from('tickets').update({ status: 'approved_closeout', signoff_status: 'accepted', updated_at: now, last_internal_update_at: now }).eq('id', ticketId)
    } else {
      // Upheld — the requirement stands; the supplier resumes the paused step.
      await admin.from('tickets').update({ updated_at: now, last_internal_update_at: now }).eq('id', ticketId)
    }
    const msg = outcome === 'withdrawn'
      ? `Dispute resolved — ${isSnag ? 'the snag was withdrawn' : 'the evidence request was withdrawn'}. The job moves to close-out.`
      : `Dispute resolved — ${isSnag ? 'the snag stands. Please accept and schedule the fix.' : 'the evidence request stands. Please upload the evidence.'}`
    await push(admin, await supplierIds(admin, ticket.supplier_id), ticket.company_id, title, msg, `/supplier/tickets/${ticketId}`)
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  revalidatePath(`/supplier/tickets/${ticketId}`); revalidatePath(`/regional/tickets/${ticketId}`)
  revalidatePath('/supplier'); revalidatePath('/regional')
  return NextResponse.json({ ok: true })
}
