import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { serverError, parseAmount } from '@/lib/api-error'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { resolveTransition, statusLabel, resolveBlockerState, computeQuoteDue, stampFreshness, type WorkflowRole } from '@/lib/workflow'
import { notifyNextActors, logQuoteRequest } from '@/lib/services/ticket-workflow'
import { rmOwnsTicket } from '@/lib/rm-ticket-access'
import { loadSlaResolver } from '@/lib/health/data'
import type { SlaTargets } from '@/lib/health/types'
import type { Database } from '@/lib/database.types'

type Admin = ReturnType<typeof createAdminClient>
type TicketRow = Database['public']['Tables']['tickets']['Row']

// Durable log of a COC/POC review round (evidence request / snag), against the
// submission being sent back. round_no is 1-based per ticket. Mirrors the quote-
// request rounds log.
async function logSignoffRound(admin: Admin, ticket: TicketRow, signoffId: string | null, kind: 'evidence' | 'snag', reason: string | null, now: string) {
  // round_no = the reviewed submission's ordinal. The submission being sent back is
  // the latest one, so the count of signoffs (which already includes it) is its
  // number — this lines up with the "Submission #N" the RM sees.
  const { count } = await admin.from('signoffs').select('id', { count: 'exact', head: true }).eq('ticket_id', ticket.id)
  await admin.from('signoff_rounds').insert({ company_id: ticket.company_id, ticket_id: ticket.id, signoff_id: signoffId, kind, reason, round_no: count ?? 1, created_at: now })
}

// The COC/POC submission currently under review (the one an evidence-request or snag
// sends back), so the round is logged against it.
async function pendingSignoffId(admin: Admin, ticketId: string): Promise<string | null> {
  const { data } = await admin.from('signoffs').select('id').eq('ticket_id', ticketId).in('status', ['submitted', 'awaiting_regional', 'awaiting_store']).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data?.id ?? null
}

// Durable snag-fix schedule event — keeps EVERY round (proposed / approved / declined)
// for the audit trail, since the snag row only holds the latest state. Best-effort:
// a supabase error (e.g. table not migrated yet) never blocks the transition.
async function logSnagScheduleEvent(admin: Admin, ticket: TicketRow, kind: 'proposed' | 'approved' | 'declined', actorRole: string, opts: { scheduledFor?: string | null; reason?: string | null } = {}) {
  await admin.from('snag_schedule_events').insert({ company_id: ticket.company_id, ticket_id: ticket.id, kind, actor_role: actorRole, scheduled_for: opts.scheduledFor ?? null, reason: opts.reason ?? null })
}

// Action discriminator + all per-action payload fields kept optional (non-strict) —
// each action reads only the subset it needs and the switch already validates values.
const BodySchema = z.object({
  action: z.string().optional(),
  supplierId: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  amount: z.any().optional(),
  amount_incl_vat: z.any().optional(),
  file_url: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  scheduledAt: z.any().optional(),
  technicianId: z.string().optional().nullable(),
  fileUrls: z.array(z.string()).optional(),
  warranty: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  severity: z.string().optional().nullable(),
  required_correction: z.string().optional().nullable(),
})

// POST /api/tickets/:id/transition  { action, ...payload }
// Single entry point for every lifecycle move. Validates the transition against
// lib/workflow (status + role), applies the status change + side effects, and
// notifies the relevant parties.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`transition:${user.id}`, 40, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const ticketId = params.id
  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  const action = String(body.action ?? '')
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id, full_name').eq('id', user.id).single()
  const role = prof?.role as WorkflowRole | undefined
  // Individuals own standalone (company-null) tickets; suppliers work ACROSS
  // companies (incl. Motiv-pool suppliers with no company_id) and are gated by
  // hasAccess() below. Everyone else must belong to a company.
  if (!prof || !role || (role !== 'individual' && role !== 'supplier' && !prof.company_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ticket } = await admin.from('tickets').select('*').eq('id', ticketId).single()
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  // Company isolation for tenant roles (store/regional/executive/system_admin) and
  // individuals (their standalone tickets are company-null). Suppliers work ACROSS
  // companies — including Motiv-pool / individual (company-null) tickets — so their
  // own profile company_id is irrelevant; they're gated only by their
  // supplier_users / ticket_suppliers link in hasAccess() below.
  if (role !== 'supplier' && ticket.company_id !== (prof.company_id ?? null)) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }
  if (!(await hasAccess(admin, role, user.id, ticket))) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })

  // A supplier may never (re)target tickets.supplier_id — assignment is an
  // internal (RM/admin) act. Without this clamp an invited supplier could pass
  // supplierId on require_assessment/request_quote and award themselves the
  // ticket (hasAccess passes on a mere invite).
  if (role === 'supplier') body.supplierId = null

  const tr = resolveTransition(ticket.status, action, role)
  if (!tr) return NextResponse.json({ error: `You can't ${action} a ticket that is "${statusLabel(ticket.status)}".` }, { status: 400 })

  // An OPEN dispute pauses the disputed step — the supplier can't accept & schedule,
  // upload evidence or re-submit the VO, and the RM can't close out, until the dispute
  // is resolved (see /dispute). Quote-decline disputes are thread-only (raised by a
  // NON-awarded org) and must never block the awarded supplier's workflow.
  if (['accept_snag', 'submit_completion', 'start_snag', 'submit_variation', 'close_out'].includes(action)) {
    const { data: openDisputes } = await admin.from('ticket_disputes').select('id, origin').eq('ticket_id', ticketId).eq('status', 'open')
    if ((openDisputes ?? []).some(d => d.origin !== 'quote_declined')) return NextResponse.json({ error: 'This ticket has an open dispute — resolve it before continuing.' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { status: tr.to, updated_at: now }
  // Set when a supplier schedules a custom time beyond the SLA window (a proposal
  // the RM must accept) — drives who gets notified below.
  let scheduleProposed = false
  // The supplier's proposed snag-fix date (stored on the snag, not the ticket).
  let snagFixAt: string | undefined
  // Stamp freshness against the acting side (drives the health Data-Quality + stale checks).
  Object.assign(updates, stampFreshness(role, now))
  // SLA targets for due-date / blocker timestamps (first-class signals for the health engine).
  const slaRules = await loadSlaResolver(admin, ticket.company_id)
  const tgt: SlaTargets = slaRules(ticket.priority as 'P1' | 'P2' | 'P3' | 'P4')

  // SEC-008/016: when an action assigns/invites a supplier, the supplied supplier_id
  // must belong to the ticket's company or be a shared Motiv-pool supplier — never an
  // arbitrary or cross-tenant supplier UUID (RLS is bypassed by the admin client).
  if (body.supplierId && ['validate', 'require_assessment', 'request_quote', 'assign_snag'].includes(action)) {
    const { data: sup } = await admin.from('suppliers').select('company_id, is_motiv').eq('id', String(body.supplierId)).maybeSingle()
    const inScope = !!sup && (sup.company_id === ticket.company_id || sup.company_id === null || sup.is_motiv === true)
    if (!inScope) return NextResponse.json({ error: 'That supplier is not available for this ticket.' }, { status: 400 })
  }

  try {
    switch (action) {
      case 'validate':
        if (body.supplierId) updates.supplier_id = body.supplierId
        break
      case 'request_info':
        updates.info_request_reason = body.reason ?? null
        updates.info_requested_at = now
        break
      case 'resubmit':
        // Store manager supplied the requested info — stamp it for the audit trail.
        updates.info_added_at = now
        break
      case 'reject':
        updates.cancellation_reason = body.reason ?? null
        break
      case 'require_assessment':
        updates.assessment_required = true
        if (body.supplierId) updates.supplier_id = body.supplierId
        break
      case 'request_quote':
        updates.quote_required = true; updates.quote_requested_at = now; updates.quote_due_at = computeQuoteDue(now, tgt)
        // Set-once so the FIRST quote request survives later re-requests in the trail.
        updates.first_quote_requested_at = ticket.first_quote_requested_at ?? now
        // Durable per-round log → a "Quote requested from <supplier>" audit event.
        await logQuoteRequest(admin, ticket, body.supplierId, now)
        if (body.supplierId) updates.supplier_id = body.supplierId
        break
      case 'request_evidence': {
        updates.evidence_required = true
        updates.evidence_request_reason = body.reason ?? null
        // Record the sent-back submission distinctly so the trail reads "More info
        // requested" (not a snag), and a later snag only rejects the next submission.
        const supersededId = await pendingSignoffId(admin, ticketId)
        await admin.from('signoffs').update({ status: 'evidence_requested', reject_reason: body.reason ?? null, reviewed_by: user.id, reviewed_at: now }).eq('ticket_id', ticketId).in('status', ['submitted', 'awaiting_regional', 'awaiting_store'])
        await logSignoffRound(admin, ticket, supersededId, 'evidence', body.reason ?? null, now)
        break
      }
      case 'submit_quote': {
        // SEC-017: use parseAmount (rejects NaN/Infinity/over-cap), not a bare > 0 check.
        const amount = parseAmount(body.amount)
        if (amount == null) return NextResponse.json({ error: 'Valid quote amount required' }, { status: 400 })
        await admin.from('quotes').insert({ company_id: ticket.company_id, ticket_id: ticketId, supplier_id: ticket.supplier_id, submitted_by: user.id, amount, amount_incl_vat: body.amount_incl_vat ?? null, file_url: body.file_url ?? null, status: 'pending', description: body.description ?? null })
        updates.quote_submitted_at = now; updates.quote_value = amount; updates.quote_decision_required = true; updates.quote_decision_status = 'pending'
        break
      }
      // SEC-018: approve_quote / reject_quote removed — quote decisions run through
      // /api/tickets/[id]/quote-decision only (single-award + invite-close logic).
      case 'schedule': {
        const when = body.scheduledAt ? new Date(body.scheduledAt) : new Date(now)
        if (isNaN(when.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
        const H = ({ P1: 8, P2: 24, P3: 72, P4: 168 } as Record<string, number>)[ticket.priority] ?? 72
        let max = new Date(new Date(ticket.created_at).getTime() + H * 3600_000)
        if (max.getTime() <= Date.now()) max = new Date(Date.now() + H * 3600_000)
        const maxEnd = new Date(max); maxEnd.setHours(23, 59, 59, 999) // day-granular window
        if (when.getTime() < Date.now() - 5 * 60_000) return NextResponse.json({ error: 'Cannot schedule in the past.' }, { status: 400 })
        // A custom time beyond the priority window is allowed, but it's a PROPOSAL
        // the RM must accept (accept_schedule) before it counts against the SLA.
        scheduleProposed = when.getTime() > maxEnd.getTime()
        updates.scheduled_at = when.toISOString()
        updates.schedule_status = scheduleProposed ? 'proposed' : 'agreed'
        // Optional: assign the technician who will attend (supplier's own roster).
        // SEC-031: verify the technician belongs to this ticket's awarded supplier —
        // don't let a caller point the ticket at an arbitrary technician UUID.
        if (body.technicianId) {
          const { data: tech } = await admin.from('technicians').select('supplier_id').eq('id', String(body.technicianId)).maybeSingle()
          if (!tech || tech.supplier_id !== ticket.supplier_id) return NextResponse.json({ error: 'That technician is not on this job’s supplier roster.' }, { status: 400 })
          updates.technician_id = body.technicianId
        } else if (body.technicianId !== undefined) {
          updates.technician_id = null
        }
        break
      }
      case 'accept_schedule': {
        // RM agrees to the supplier's proposed time → it becomes the resolution
        // deadline, so meeting it is not an SLA breach for the supplier or the RM.
        const sched = ticket.scheduled_at
        if (!sched) return NextResponse.json({ error: 'Nothing scheduled to accept.' }, { status: 400 })
        updates.schedule_status = 'agreed'
        updates.adjusted_resolution_due_at = sched
        updates.attendance_due_at = sched
        updates.first_response_due_at = sched
        break
      }
      case 'start_work':
        updates.first_response_at = ticket.first_response_at ?? now; updates.attended_at = ticket.attended_at ?? now
        break
      case 'submit_variation': {
        const desc = String(body.description ?? '').trim()
        if (!desc) return NextResponse.json({ error: 'Variation description required' }, { status: 400 })
        const fileUrls = Array.isArray(body.fileUrls) ? body.fileUrls.filter((u: unknown): u is string => typeof u === 'string') : []
        const warranty = typeof body.warranty === 'string' && body.warranty.trim() ? body.warranty.trim() : null
        await admin.from('ticket_variations').insert({ company_id: ticket.company_id, ticket_id: ticketId, supplier_id: ticket.supplier_id, description: desc, amount: body.amount ? Number(body.amount) : null, amount_incl_vat: body.amount_incl_vat ? Number(body.amount_incl_vat) : null, warranty, status: 'pending', submitted_by: user.id, file_urls: fileUrls })
        break
      }
      case 'approve_variation':
        await admin.from('ticket_variations').update({ status: 'approved', reviewed_by: user.id, reviewed_at: now }).eq('ticket_id', ticketId).eq('status', 'pending')
        break
      case 'reject_variation':
        await admin.from('ticket_variations').update({ status: 'rejected', reviewed_by: user.id, reviewed_at: now, reject_reason: body.reason ?? null }).eq('ticket_id', ticketId).eq('status', 'pending')
        break
      case 'submit_completion': {
        const { data: ev } = await admin.from('ticket_evidence').select('kind, url').eq('ticket_id', ticketId).order('created_at', { ascending: true })
        const before = (ev ?? []).filter(e => e.kind === 'before_photo').map(e => e.url)
        const after = (ev ?? []).filter(e => e.kind === 'after_photo').map(e => e.url)
        // COC/invoice are single-valued. The evidence log accumulates across resubmission
        // rounds, so take the LATEST upload — an early .find() kept showing round 1's COC.
        const cocRows = (ev ?? []).filter(e => e.kind === 'coc')
        const coc = cocRows.length ? cocRows[cocRows.length - 1].url : null
        const invoiceRows = (ev ?? []).filter(e => e.kind === 'invoice')
        const invoice = invoiceRows.length ? invoiceRows[invoiceRows.length - 1].url : null
        await admin.from('signoffs').insert({ company_id: ticket.company_id, ticket_id: ticketId, supplier_id: ticket.supplier_id, before_urls: before, after_urls: after, coc_url: coc, invoice_url: invoice, status: 'submitted', notes: body.notes ?? null })
        updates.submitted_for_signoff_at = now; updates.signoff_status = 'submitted'
        updates.evidence_required = true
        updates.before_photo_uploaded = before.length > 0; updates.after_photo_uploaded = after.length > 0
        updates.completion_certificate_uploaded = !!coc; updates.invoice_uploaded = !!invoice
        break
      }
      case 'approve':
        await admin.from('signoffs').update({ status: 'accepted', reviewed_by: user.id, reviewed_at: now }).eq('ticket_id', ticketId).in('status', ['submitted', 'awaiting_regional', 'awaiting_store'])
        // Accepting the sign-off closes any open snag — a snag stays open until the
        // corrective work is completed and the RM accepts it.
        await admin.from('snags').update({ status: 'resolved' }).eq('ticket_id', ticketId).in('status', ['open', 'assigned', 'in_progress'])
        // Approving the COC/POC moves to the close-out stage (approved_closeout) — the
        // supplier may raise a variation order before the RM's final close-out. The
        // ticket is completed by the separate close_out action below.
        break
      case 'raise_snag': {
        const supersededId = await pendingSignoffId(admin, ticketId)
        await admin.from('snags').insert({ company_id: ticket.company_id, ticket_id: ticketId, store_id: ticket.store_id, supplier_id: ticket.supplier_id, description: body.description ?? null, severity: body.severity ?? null, required_correction: body.required_correction ?? null, status: 'open' })
        await admin.from('signoffs').update({ status: 'rejected', reject_reason: body.description ?? 'Snag raised', reviewed_by: user.id, reviewed_at: now }).eq('ticket_id', ticketId).in('status', ['submitted', 'awaiting_regional', 'awaiting_store'])
        updates.evidence_required = true
        await logSignoffRound(admin, ticket, supersededId, 'snag', body.description ?? null, now)
        break
      }
      case 'assign_snag':
        updates.assigned_user_id = body.supplierId ?? ticket.supplier_id
        if (body.supplierId) updates.supplier_id = body.supplierId
        await admin.from('snags').update({ status: 'assigned', assigned_at: now, supplier_id: body.supplierId ?? ticket.supplier_id }).eq('ticket_id', ticketId).in('status', ['open'])
        break
      case 'accept_snag': {
        // Supplier accepts the snag and proposes when the fix will be done. The date
        // is stored on the snag (proposed) and sent to the RM to approve — the original
        // job's tickets.scheduled_at is left untouched (kept for the audit trail).
        const when = body.scheduledAt ? new Date(body.scheduledAt) : null
        if (!when || isNaN(when.getTime())) return NextResponse.json({ error: 'Pick when the snag will be fixed.' }, { status: 400 })
        if (when.getTime() < Date.now() - 5 * 60_000) return NextResponse.json({ error: 'Cannot schedule in the past.' }, { status: 400 })
        snagFixAt = when.toISOString()
        await admin.from('snags').update({ status: 'assigned', assigned_at: now, supplier_id: ticket.supplier_id, scheduled_at: snagFixAt, schedule_status: 'proposed' }).eq('ticket_id', ticketId).in('status', ['open'])
        // Durable "proposed" event (keeps every round for the audit trail).
        await logSnagScheduleEvent(admin, ticket, 'proposed', 'supplier', { scheduledFor: snagFixAt })
        break
      }
      case 'approve_snag':
        // RM approves the proposed snag-fix date → the supplier can start the work.
        await admin.from('snags').update({ schedule_status: 'agreed' }).eq('ticket_id', ticketId).eq('schedule_status', 'proposed')
        // Stamp the approval time for the audit trail (best-effort — never blocks approval).
        await admin.from('snags').update({ schedule_agreed_at: now }).eq('ticket_id', ticketId).eq('schedule_status', 'agreed')
        await logSnagScheduleEvent(admin, ticket, 'approved', 'regional_manager')
        break
      case 'decline_snag_schedule':
        // RM rejects the proposed snag-fix date → send it back so the supplier proposes
        // a new one. Reset the snag to 'open' (accept_snag re-proposes on 'open' snags)
        // but KEEP scheduled_at and mark the schedule 'declined' — the declined date +
        // reason survive on the row so the supplier's reschedule prompt can show them.
        // 'declined' still blocks start_snag (its gate requires 'agreed') and every
        // "actively scheduled" consumer checks for 'proposed'/'agreed'.
        await admin.from('snags').update({ status: 'open', schedule_status: 'declined' }).eq('ticket_id', ticketId).in('status', ['assigned', 'in_progress'])
        // Persist the reason + time (best-effort, separate update) so it shows on the
        // ticket + audit trail, not only in the notification — never blocks the reset.
        await admin.from('snags').update({ schedule_decline_reason: body.reason ?? null, schedule_declined_at: now }).eq('ticket_id', ticketId).eq('status', 'open')
        await logSnagScheduleEvent(admin, ticket, 'declined', 'regional_manager', { reason: body.reason ?? null })
        break
      case 'start_snag': {
        // Only after the RM has approved the proposed snag-fix date.
        const { data: snag } = await admin.from('snags').select('schedule_status').eq('ticket_id', ticketId).in('status', ['assigned', 'in_progress', 'open']).order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (snag && snag.schedule_status !== 'agreed') return NextResponse.json({ error: 'The manager still needs to approve the snag schedule.' }, { status: 400 })
        await admin.from('snags').update({ status: 'in_progress' }).eq('ticket_id', ticketId).in('status', ['assigned', 'open'])
        break
      }
      case 'resolve_snag':
        await admin.from('snags').update({ status: 'resolved' }).eq('ticket_id', ticketId).in('status', ['assigned', 'in_progress', 'open'])
        break
      case 'close_out':
        // Blocked until the supplier has confirmed there are no further variation orders.
        if (!ticket.vo_none_confirmed_at) return NextResponse.json({ error: 'The supplier must confirm there are no further variation orders before close-out.' }, { status: 409 })
        updates.completed_at = now; updates.closed_out_at = now; updates.closed_out_by = user.id
        break
      // validate / reject / proceed_no_quote / request_evidence: status-only
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Action failed' }, { status: 400 })
  }

  // Blocker / pause / owner columns derived from the destination status, so the
  // stored signals stay in lock-step with the health engine's own derivation.
  Object.assign(updates, resolveBlockerState(tr.to, now, tgt))

  const { error: upErr } = await admin.from('tickets').update(updates as Database['public']['Tables']['tickets']['Update']).eq('id', ticketId)
  if (upErr) return serverError(upErr)

  await notifyNextActors(admin, ticket, action, prof.full_name ?? null, { scheduleProposed, scheduledAt: (updates.scheduled_at as string | undefined) ?? snagFixAt, declineReason: body.reason ?? null })

  revalidatePath(`/supplier/tickets/${ticketId}`);revalidatePath('/supplier')
  revalidatePath('/regional');revalidatePath('/regional/tickets');revalidatePath('/client');revalidatePath('/client/visits');revalidatePath(`/client/tickets/${ticketId}`);revalidatePath('/executive')
  if (action === 'close_out' || tr.to === 'completed') {
    // Completion → refresh reports + estate/regional dashboards (health scores live-compute from tickets).
    revalidatePath('/regional/reports'); revalidatePath('/executive/reports'); revalidatePath('/executive/stores'); revalidatePath('/regional/stores')
  }
  return NextResponse.json({ ok: true, status: tr.to })
}

async function hasAccess(admin: Admin, role: WorkflowRole, userId: string, ticket: TicketRow): Promise<boolean> {
  if (role === 'executive' || role === 'system_admin') return true
  if (role === 'supplier') {
    const { data } = await admin.from('supplier_users').select('supplier_id').eq('user_id', userId)
    const mine = (data ?? []).map(l => l.supplier_id)
    if (ticket.supplier_id && mine.includes(ticket.supplier_id)) return true
    // SEC-007: only an ACTIVE invite grants access (competitive-quote model). A
    // losing/closed or declined invitee must NOT retain access to a ticket awarded
    // to another supplier — gate the fallback on active statuses only.
    const { data: inv } = await admin.from('ticket_suppliers').select('id')
      .eq('ticket_id', ticket.id)
      .in('supplier_id', mine.length ? mine : ['00000000-0000-0000-0000-000000000000'])
      .in('status', ['invited', 'quoted', 'awarded'])
      .maybeSingle()
    return !!inv
  }
  if (role === 'regional_manager') return rmOwnsTicket(admin, userId, ticket)
  if (role === 'store_manager') {
    const { data } = await admin.from('store_users').select('store_id').eq('user_id', userId)
    return (data ?? []).some(l => l.store_id === ticket.store_id)
  }
  // An individual owns their standalone tickets outright (created_by).
  if (role === 'individual') return ticket.created_by === userId
  return false
}

