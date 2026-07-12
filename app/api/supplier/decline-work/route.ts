import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'

const BodySchema = z.object({
  ticketId: z.string(),
  reason: z.string(),
})

// POST /api/supplier/decline-work  { ticketId, reason }
// A supplier opts out of a job they were invited to quote. Allowed only BEFORE
// award (their invite is still 'invited'/'quoted' and the ticket is still in the
// commercial phase). Marks their invite declined, withdraws any pending quote,
// and notifies the region's RMs — the ticket carries on with the other suppliers.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`supplier-decline:${user.id}`, 20, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  const ticketId = String(body.ticketId ?? '')
  const reason = String(body.reason ?? '').trim()
  if (!ticketId) return NextResponse.json({ error: 'ticketId required' }, { status: 400 })
  if (!reason) return NextResponse.json({ error: 'A reason is required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  // Pool/Motiv suppliers have no company_id — access is gated by the invite below.
  if (prof?.role !== 'supplier') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: links } = await admin.from('supplier_users').select('supplier_id').eq('user_id', user.id)
  const supplierIds = (links ?? []).map(l => l.supplier_id)
  if (!supplierIds.length) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ticket } = await admin.from('tickets').select('id, company_id, region_id, title, supplier_id, status, created_by').eq('id', ticketId).single()
  // Access is by ASSIGNMENT, not company — the invite check below is the real gate.
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  // The supplier's invite — decline is only offered before award (invited/quoted).
  const { data: invite } = await admin.from('ticket_suppliers').select('id, supplier_id, status').eq('ticket_id', ticketId).in('supplier_id', supplierIds).maybeSingle()
  if (!invite) return NextResponse.json({ error: 'You were not invited to this job.' }, { status: 403 })
  const COMMERCIAL = ['open', 'info_requested', 'assigned', 'assessment', 'quote_requested', 'quoted', 'quote_revision']
  if (!['invited', 'quoted'].includes(invite.status) || !!ticket.supplier_id || !COMMERCIAL.includes(ticket.status)) {
    return NextResponse.json({ error: 'This job can no longer be declined — it has moved past quoting.' }, { status: 400 })
  }

  const nowIso = new Date().toISOString()
  await admin.from('ticket_suppliers').update({ status: 'declined', decline_reason: reason, declined_by: 'supplier', responded_at: nowIso }).eq('id', invite.id)
  await admin.from('quotes').update({ status: 'declined', decline_reason: reason, updated_at: nowIso }).eq('ticket_id', ticketId).eq('supplier_id', invite.supplier_id).eq('status', 'pending')
  // Durable audit record — survives a later re-invite of this same supplier (which
  // resets the ticket_suppliers row), so "Quote request declined by {supplier}"
  // stays in the trail permanently.
  await admin.from('ticket_supplier_declines').insert({ company_id: ticket.company_id, ticket_id: ticketId, supplier_id: invite.supplier_id, reason, declined_at: nowIso })

  // If EVERY invited supplier has now declined, return the ticket to 'open' so the
  // RM can assign new suppliers. Each supplier's decline stays visible in the RM's
  // "Suppliers requested" list (red dot + reason) and the audit trail.
  const { data: allInvites } = await admin.from('ticket_suppliers').select('status').eq('ticket_id', ticketId)
  const allDeclined = !ticket.supplier_id && (allInvites ?? []).length > 0 && (allInvites ?? []).every(i => ['declined', 'closed'].includes(i.status))
  if (allDeclined) {
    await admin.from('tickets').update({
      status: 'open', supplier_id: null, quote_required: false,
      current_blocker: null, blocker_owner_type: null, blocker_started_at: null, sla_paused: false,
      last_internal_update_at: nowIso, updated_at: nowIso,
    }).eq('id', ticketId)
  }

  // Tell the region's RMs so they can pick another supplier.
  if (ticket.region_id) {
    const { data: rms } = await admin.from('regional_users').select('user_id').eq('region_id', ticket.region_id)
    const ids = (rms ?? []).map(r => r.user_id)
    if (ids.length) {
      const msg = allDeclined ? `Every invited supplier has now declined this job, so it needs a new supplier. Their latest reason: ${reason}.` : `A supplier has declined this job. Their reason: ${reason}.`
      await admin.from('notifications').insert(ids.map(id => ({ company_id: ticket.company_id, user_id: id, ticket_id: ticketId, type: 'ticket_update', title: `${ticket.title ?? 'Untitled'}`, message: msg, link: `/regional/tickets/${ticketId}` })))
      void sendPushToMany(ids, { title: allDeclined ? 'All suppliers declined' : 'A supplier declined the work', body: reason, url: `/regional/tickets/${ticketId}` })
    }
  } else if (ticket.created_by) {
    // Standalone individual ticket — tell the owner so they can pick another supplier.
    const msg = allDeclined ? `Every supplier you invited has declined this job, so please choose another. Their latest reason: ${reason}.` : `A supplier has declined this job. Their reason: ${reason}.`
    await admin.from('notifications').insert([{ company_id: ticket.company_id, user_id: ticket.created_by, ticket_id: ticketId, type: 'ticket_update', title: `${ticket.title ?? 'Untitled'}`, message: msg, link: `/individual/tickets/${ticketId}` }])
    void sendPushToMany([ticket.created_by], { title: 'A supplier declined the work', body: reason, url: `/individual/tickets/${ticketId}` })
  }

  revalidatePath(`/supplier/tickets/${ticketId}`); revalidatePath('/supplier')
  revalidatePath('/regional'); revalidatePath('/regional/tickets'); revalidatePath(`/regional/tickets/${ticketId}`)
  revalidatePath('/individual'); revalidatePath(`/individual/tickets/${ticketId}`)
  return NextResponse.json({ ok: true })
}
