import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { serverError } from '@/lib/api-error'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'
import { loadSlaResolver } from '@/lib/health/data'
import { isCommercialPhase, computeQuoteDue, stampFreshness } from '@/lib/workflow'
import { logQuoteRequest } from '@/lib/services/ticket-workflow'
import { rmOwnsTicket } from '@/lib/rm-ticket-access'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'

const BodySchema = z.object({
  supplierIds: z.array(z.any()).optional(),
})

// POST /api/tickets/[id]/assign — RM invites one or more suppliers to quote.
// Creates ticket_suppliers rows (invited), moves the ticket to "assigned", and
// notifies every invited supplier. The winner is chosen later via /quote-decision.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`assign:${user.id}`, 30, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  const supplierIds: string[] = Array.isArray(body.supplierIds) ? body.supplierIds.filter((s: unknown) => typeof s === 'string') : []
  if (!supplierIds.length) return NextResponse.json({ error: 'Select at least one supplier.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id, full_name').eq('id', user.id).single()
  const isIndividual = prof?.role === 'individual'
  // SEC-045: executive is read-only — only regional_manager (or the individual owner) may assign.
  if (!prof || (!isIndividual && (!prof.company_id || prof.role !== 'regional_manager'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ticket } = await admin.from('tickets').select('*').eq('id', params.id).single()
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  if (isIndividual) {
    // Individuals assign from the Motiv pool on their own standalone tickets.
    if (ticket.created_by !== user.id) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  } else {
    if (ticket.company_id !== prof.company_id) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    if (prof.role === 'regional_manager' && !(await rmOwnsTicket(admin, user.id, ticket))) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  }
  // Allowed only during the competitive commercial phase (shared with lib/workflow):
  // before a quote is approved, incl. re-opened tickets and suppliers_declined.
  if (!isCommercialPhase(ticket.status)) {
    return NextResponse.json({ error: 'Suppliers can only be assigned before a quote is approved.' }, { status: 400 })
  }

  // SEC-008/016: every selected supplier must belong to the ticket's company or be a
  // shared Motiv-pool supplier — reject arbitrary or cross-tenant supplier UUIDs
  // (the admin client bypasses RLS, so this is the only tenant guard on assignment).
  const { data: supRows } = await admin.from('suppliers').select('id, company_id, is_motiv').in('id', supplierIds)
  const inScope = (s: NonNullable<typeof supRows>[number]) => s.company_id === ticket.company_id || s.company_id === null || s.is_motiv === true
  const validIds = new Set((supRows ?? []).filter(inScope).map(s => s.id))
  if (validIds.size !== supplierIds.length) return NextResponse.json({ error: 'One or more selected suppliers are not available for this ticket.' }, { status: 400 })

  const now = new Date().toISOString()
  // Individual tickets have no company SLA config — use a default quote window.
  // B19 note: the individual branch stays inline (computeQuoteDue needs an SlaTargets
  // and has no individual-default parameter); the company branch uses the shared helper.
  let quoteDueAt: string
  if (isIndividual) {
    quoteDueAt = new Date(Date.now() + 48 * 60 * 60_000).toISOString()
  } else {
    const rules = await loadSlaResolver(admin, ticket.company_id)
    const tgt = rules(ticket.priority as 'P1' | 'P2' | 'P3' | 'P4')
    quoteDueAt = computeQuoteDue(now, tgt)
  }

  // Split the selection: suppliers previously declined/closed on this ticket are
  // RE-INVITED (reset to 'invited', stamped as a re-quote request); never-involved
  // suppliers get a fresh invite; already-active invites are left untouched.
  const { data: existingInvites } = await admin.from('ticket_suppliers').select('supplier_id, status').eq('ticket_id', ticket.id).in('supplier_id', supplierIds)
  const statusById = new Map((existingInvites ?? []).map(r => [r.supplier_id, r.status]))
  const reinvite = supplierIds.filter(id => ['declined', 'closed'].includes(statusById.get(id) ?? ''))
  const fresh = supplierIds.filter(id => !statusById.has(id))

  if (reinvite.length) {
    const { error } = await admin.from('ticket_suppliers')
      .update({ status: 'invited', invited_at: now, responded_at: null, decline_reason: null, declined_by: null, requote_requested_at: now })
      .eq('ticket_id', ticket.id).in('supplier_id', reinvite)
    if (error) return serverError(error)
  }
  if (fresh.length) {
    const { error } = await admin.from('ticket_suppliers')
      .insert(fresh.map(supplier_id => ({ company_id: ticket.company_id, ticket_id: ticket.id, supplier_id, status: 'invited', invited_at: now })))
    if (error) return serverError(error)
  }

  await admin.from('tickets').update({
    status: 'assigned', supplier_id: null, quote_required: true, quote_requested_at: now, quote_due_at: quoteDueAt,
    // Set-once: the FIRST quote request stays in the audit trail across re-assigns.
    first_quote_requested_at: ticket.first_quote_requested_at ?? now,
    // B19 note: blocker columns stay inline (NOT resolveBlockerState('assigned')) — this
    // route historically leaves internal_action_due_at untouched, while the shared helper
    // nulls it; behaviour is preserved verbatim pending dedupe.
    current_blocker: 'supplier_action', blocker_owner_type: 'supplier', blocker_started_at: now, sla_paused: false,
    ...stampFreshness(isIndividual ? 'individual' : 'regional_manager', now), updated_at: now,
  }).eq('id', ticket.id)
  // Durable log of this request round — one row PER supplier (re)invited, so the
  // audit trail reads "Quote requested from <supplier>" for each. Kept even after
  // invite rows are reset on a later re-assign.
  const requestedThisRound = [...reinvite, ...fresh]
  for (const supplier_id of requestedThisRound) {
    await logQuoteRequest(admin, ticket, supplier_id, now)
  }

  // Notify the invited suppliers — re-invited ones hear it's a re-quote request.
  // B19 note: stays inline (NOT notifyNextActors) — the service routes supplier
  // notifications via tickets.supplier_id (which assign nulls); this is a multi-org
  // invite fan-out with distinct re-invite vs fresh copy and its own push title.
  // Preserved verbatim pending dedupe.
  const { data: su } = await admin.from('supplier_users').select('user_id, supplier_id').in('supplier_id', supplierIds)
  const reSet = new Set(reinvite)
  const reUsers = Array.from(new Set((su ?? []).filter(r => reSet.has(r.supplier_id)).map(r => r.user_id)))
  const freshUsers = Array.from(new Set((su ?? []).filter(r => !reSet.has(r.supplier_id)).map(r => r.user_id))).filter(id => !reUsers.includes(id))
  const notifRows = [
    ...reUsers.map(id => ({ company_id: ticket.company_id, user_id: id, ticket_id: ticket.id, type: 'ticket_update', title: `${ticket.title ?? 'Untitled'}`, message: 'The regional manager has asked you to send an updated quote for this job.', link: `/supplier/tickets/${ticket.id}` })),
    ...freshUsers.map(id => ({ company_id: ticket.company_id, user_id: id, ticket_id: ticket.id, type: 'ticket_update', title: `${ticket.title ?? 'Untitled'}`, message: 'You have been invited to send a quote for this job.', link: `/supplier/tickets/${ticket.id}` })),
  ]
  if (notifRows.length) {
    await admin.from('notifications').insert(notifRows)
    void sendPushToMany([...reUsers, ...freshUsers], { title: 'New quote request', body: ticket.title ?? 'A ticket needs your quote', url: `/supplier/tickets/${ticket.id}` })
  }

  revalidatePath('/regional');revalidatePath('/regional/tickets');revalidatePath(`/regional/tickets/${ticket.id}`);revalidatePath('/supplier')
  revalidatePath('/individual');revalidatePath(`/individual/tickets/${ticket.id}`)
  return NextResponse.json({ ok: true })
}
