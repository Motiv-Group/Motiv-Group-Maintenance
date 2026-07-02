import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'
import { resolveTransition, statusLabel, type WorkflowRole } from '@/lib/workflow'
import { loadSlaResolver } from '@/lib/health/data'
import type { SlaTargets } from '@/lib/health/types'

type Admin = ReturnType<typeof createAdminClient>

// POST /api/tickets/:id/transition  { action, ...payload }
// Single entry point for every lifecycle move. Validates the transition against
// lib/workflow (status + role), applies the status change + side effects, and
// notifies the relevant parties.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!rateLimit(`transition:${user.id}`, 40, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const ticketId = params.id
  const body = await request.json().catch(() => ({}))
  const action = String(body.action ?? '')
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id, full_name').eq('id', user.id).single()
  const role = prof?.role as WorkflowRole | undefined
  if (!role || !prof?.company_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ticket } = await admin.from('tickets').select('*').eq('id', ticketId).single()
  if (!ticket || ticket.company_id !== prof.company_id) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  if (!(await hasAccess(admin, role, user.id, ticket))) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })

  const tr = resolveTransition(ticket.status, action, role)
  if (!tr) return NextResponse.json({ error: `You can't ${action} a ticket that is "${statusLabel(ticket.status)}".` }, { status: 400 })

  const now = new Date().toISOString()
  const addMins = (m: number) => new Date(new Date(now).getTime() + m * 60_000).toISOString()
  const updates: Record<string, unknown> = { status: tr.to, updated_at: now }
  // Set when a supplier schedules a custom time beyond the SLA window (a proposal
  // the RM must accept) — drives who gets notified below.
  let scheduleProposed = false
  // The supplier's proposed snag-fix date (stored on the snag, not the ticket).
  let snagFixAt: string | undefined
  // Stamp freshness against the acting side (drives the health Data-Quality + stale checks).
  const freshness = role === 'supplier' ? { last_supplier_update_at: now }
    : role === 'store_manager' ? { last_store_update_at: now }
    : { last_internal_update_at: now }
  Object.assign(updates, freshness)
  // SLA targets for due-date / blocker timestamps (first-class signals for the health engine).
  const slaRules = await loadSlaResolver(admin, ticket.company_id)
  const tgt: SlaTargets = slaRules(ticket.priority as 'P1' | 'P2' | 'P3' | 'P4')

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
        updates.quote_required = true; updates.quote_requested_at = now; updates.quote_due_at = addMins(tgt.quote_due_mins)
        // Set-once so the FIRST quote request survives later re-requests in the trail.
        updates.first_quote_requested_at = ticket.first_quote_requested_at ?? now
        // Durable per-round log → a "Quote requested from <supplier>" audit event.
        await admin.from('ticket_quote_requests').insert({ company_id: ticket.company_id, ticket_id: ticketId, supplier_id: body.supplierId ?? ticket.supplier_id ?? null, requested_at: now })
        if (body.supplierId) updates.supplier_id = body.supplierId
        break
      case 'request_evidence':
        updates.evidence_required = true
        updates.evidence_request_reason = body.reason ?? null
        // Record the sent-back submission distinctly so the trail reads "More info
        // requested" (not a snag), and a later snag only rejects the next submission.
        await admin.from('signoffs').update({ status: 'evidence_requested', reject_reason: body.reason ?? null, reviewed_by: user.id, reviewed_at: now }).eq('ticket_id', ticketId).in('status', ['submitted', 'awaiting_regional', 'awaiting_store'])
        break
      case 'submit_quote': {
        const amount = Number(body.amount)
        if (!amount || amount <= 0) return NextResponse.json({ error: 'Valid quote amount required' }, { status: 400 })
        await admin.from('quotes').insert({ company_id: ticket.company_id, ticket_id: ticketId, supplier_id: ticket.supplier_id, submitted_by: user.id, amount, amount_incl_vat: body.amount_incl_vat ?? null, file_url: body.file_url ?? null, status: 'pending', description: body.description ?? null })
        updates.quote_submitted_at = now; updates.quote_value = amount; updates.quote_decision_required = true; updates.quote_decision_status = 'pending'
        break
      }
      case 'approve_quote':
        updates.quote_decision_status = 'approved'; updates.quote_decided_at = now
        // Stamp updated_at so the audit trail shows the real decision time (no trigger on quotes).
        await admin.from('quotes').update({ status: 'accepted', updated_at: now }).eq('ticket_id', ticketId).eq('status', 'pending')
        break
      case 'reject_quote':
        updates.quote_decision_status = 'rejected'; updates.quote_decided_at = now
        await admin.from('quotes').update({ status: 'declined', updated_at: now }).eq('ticket_id', ticketId).eq('status', 'pending')
        break
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
        if (body.technicianId !== undefined) updates.technician_id = body.technicianId || null
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
        await admin.from('ticket_variations').insert({ company_id: ticket.company_id, ticket_id: ticketId, supplier_id: ticket.supplier_id, description: desc, amount: body.amount ? Number(body.amount) : null, warranty, status: 'pending', submitted_by: user.id, file_urls: fileUrls })
        break
      }
      case 'approve_variation':
        await admin.from('ticket_variations').update({ status: 'approved', reviewed_by: user.id, reviewed_at: now }).eq('ticket_id', ticketId).eq('status', 'pending')
        break
      case 'reject_variation':
        await admin.from('ticket_variations').update({ status: 'rejected', reviewed_by: user.id, reviewed_at: now, reject_reason: body.reason ?? null }).eq('ticket_id', ticketId).eq('status', 'pending')
        break
      case 'submit_completion': {
        const { data: ev } = await admin.from('ticket_evidence').select('kind, url').eq('ticket_id', ticketId)
        const before = (ev ?? []).filter(e => e.kind === 'before_photo').map(e => e.url)
        const after = (ev ?? []).filter(e => e.kind === 'after_photo').map(e => e.url)
        const coc = (ev ?? []).find(e => e.kind === 'coc')?.url ?? null
        const invoice = (ev ?? []).find(e => e.kind === 'invoice')?.url ?? null
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
      case 'raise_snag':
        await admin.from('snags').insert({ company_id: ticket.company_id, ticket_id: ticketId, store_id: ticket.store_id, supplier_id: ticket.supplier_id, description: body.description ?? null, severity: body.severity ?? null, required_correction: body.required_correction ?? null, status: 'open' })
        await admin.from('signoffs').update({ status: 'rejected', reject_reason: body.description ?? 'Snag raised', reviewed_by: user.id, reviewed_at: now }).eq('ticket_id', ticketId).in('status', ['submitted', 'awaiting_regional', 'awaiting_store'])
        updates.evidence_required = true
        break
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
        break
      }
      case 'approve_snag':
        // RM approves the proposed snag-fix date → the supplier can start the work.
        await admin.from('snags').update({ schedule_status: 'agreed' }).eq('ticket_id', ticketId).eq('schedule_status', 'proposed')
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
        updates.completed_at = now; updates.closed_out_at = now; updates.closed_out_by = user.id
        break
      // validate / reject / proceed_no_quote / request_evidence: status-only
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Action failed' }, { status: 400 })
  }

  // Blocker / pause / owner columns derived from the destination status, so the
  // stored signals stay in lock-step with the health engine's own derivation.
  Object.assign(updates, lifecycleFields(tr.to, now, tgt))

  const { error: upErr } = await admin.from('tickets').update(updates).eq('id', ticketId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  await notify(admin, action, ticket, prof.full_name ?? null, { scheduleProposed, scheduledAt: (updates.scheduled_at as string | undefined) ?? snagFixAt })

  revalidatePath(`/supplier/tickets/${ticketId}`); revalidatePath('/supplier')
  revalidatePath('/regional'); revalidatePath('/regional/tickets'); revalidatePath('/client'); revalidatePath('/client/visits'); revalidatePath(`/client/tickets/${ticketId}`); revalidatePath('/executive')
  if (action === 'close_out' || tr.to === 'completed') {
    // Completion → refresh reports + estate/regional dashboards (health scores live-compute from tickets).
    revalidatePath('/regional/reports'); revalidatePath('/executive/reports'); revalidatePath('/executive/stores'); revalidatePath('/regional/stores')
  }
  return NextResponse.json({ ok: true, status: tr.to })
}

// Map a destination status → the explicit blocker/pause columns the health
// engine reads. Mirrors lib/health/sla.ts status buckets. Idempotent: each
// transition (re)sets blocker_started_at = now for the new blocker state.
function lifecycleFields(to: string, now: string, tgt: SlaTargets): Record<string, unknown> {
  const addMins = (m: number) => new Date(new Date(now).getTime() + m * 60_000).toISOString()
  const supplier = { current_blocker: 'supplier_action', blocker_owner_type: 'supplier', blocker_started_at: now, sla_paused: false, internal_action_due_at: null }
  const internalDecision = { current_blocker: 'quote_approval', blocker_owner_type: 'regional_manager', blocker_started_at: now, sla_paused: true, pause_reason: 'awaiting_decision', pause_started_at: now, internal_action_due_at: addMins(tgt.internal_decision_mins) }
  const signoff = { current_blocker: 'completion_signoff', blocker_owner_type: 'regional_manager', blocker_started_at: now, sla_paused: true, pause_reason: 'awaiting_signoff', pause_started_at: now, internal_action_due_at: addMins(tgt.internal_decision_mins) }
  const cleared = { current_blocker: null, blocker_owner_type: null, blocker_started_at: null, sla_paused: false, pause_ended_at: now, internal_action_due_at: null }
  switch (to) {
    case 'quoted': case 'variation_review': return internalDecision
    case 'submitted_for_signoff': case 'approved_closeout': return signoff
    case 'completed': case 'cancelled': case 'declined': return cleared
    case 'open': return { current_blocker: null, blocker_owner_type: null, blocker_started_at: null, sla_paused: false, internal_action_due_at: null }
    case 'info_requested': return { current_blocker: null, blocker_owner_type: 'store', sla_paused: false, internal_action_due_at: null }
    default: return supplier
  }
}

async function hasAccess(admin: Admin, role: WorkflowRole, userId: string, ticket: any): Promise<boolean> {
  if (role === 'executive' || role === 'system_admin') return true
  if (role === 'supplier') {
    const { data } = await admin.from('supplier_users').select('supplier_id').eq('user_id', userId)
    const mine = (data ?? []).map(l => l.supplier_id)
    if (ticket.supplier_id && mine.includes(ticket.supplier_id)) return true
    // Also allow suppliers invited to quote (competitive model) before award.
    const { data: inv } = await admin.from('ticket_suppliers').select('id').eq('ticket_id', ticket.id).in('supplier_id', mine.length ? mine : ['00000000-0000-0000-0000-000000000000']).maybeSingle()
    return !!inv
  }
  if (role === 'regional_manager') {
    const { data } = await admin.from('regional_users').select('region_id').eq('user_id', userId)
    return !!ticket.region_id && (data ?? []).some(l => l.region_id === ticket.region_id)
  }
  if (role === 'store_manager') {
    const { data } = await admin.from('store_users').select('store_id').eq('user_id', userId)
    return (data ?? []).some(l => l.store_id === ticket.store_id)
  }
  return false
}

// Targeted notifications for the moves that need someone else to act next.
async function notify(admin: Admin, action: string, ticket: any, actorName: string | null, opts?: { scheduleProposed?: boolean; scheduledAt?: string }) {
  const toSupplier = ['validate', 'request_quote', 'require_assessment', 'approve_quote', 'request_evidence', 'raise_snag', 'assign_snag', 'approve_variation', 'reject_variation', 'accept_schedule', 'approve_snag', 'approve', 'close_out']
  const toRegion   = ['submit_quote', 'submit_completion', 'submit_variation', 'resolve_snag', 'resubmit', 'accept_snag', 'start_snag']
  // The store manager is told whenever a visit is scheduled / agreed so they can
  // expect the supplier on site.
  const toStore    = ['request_info', 'close_out', 'reject', 'schedule', 'accept_schedule', 'accept_snag']
  const title = `Ticket: ${ticket.title ?? 'Untitled'}`
  // Friendlier copy for scheduling moves; everything else uses the action verb.
  const when = opts?.scheduledAt ? new Date(opts.scheduledAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' }) : null
  const storeMsg = action === 'schedule'
    ? `Visit scheduled${when ? ` for ${when}` : ''}`
    : action === 'accept_snag' ? `Snag fix scheduled${when ? ` for ${when}` : ''}`
    : action === 'accept_schedule' ? `Visit time confirmed${when ? ` for ${when}` : ''}`
    : action === 'reject' ? 'Ticket cancelled'
    : `Update: ${action.replace(/_/g, ' ')}`

  // A custom (beyond-window) proposal also pings the RM to accept it.
  if (action === 'schedule' && opts?.scheduleProposed && ticket.region_id) {
    const { data } = await admin.from('regional_users').select('user_id').eq('region_id', ticket.region_id)
    await push(admin, (data ?? []).map(r => r.user_id), ticket.company_id, title, `Proposed visit time${when ? ` (${when})` : ''} — accept to confirm`, `/regional/tickets/${ticket.id}`)
  }

  if (toSupplier.includes(action) && ticket.supplier_id) {
    const { data } = await admin.from('supplier_users').select('user_id').eq('supplier_id', ticket.supplier_id)
    const ids = (data ?? []).map(r => r.user_id)
    const msg = action === 'accept_schedule' ? `Visit time confirmed${when ? ` for ${when}` : ''}`
      : action === 'approve_snag' ? 'Snag schedule approved — you can start the corrective work'
      : action === 'approve_variation' ? 'Variation order approved — you can continue'
      : action === 'reject_variation' ? 'Variation order declined — re-submit a revised VO or message the manager'
      : action === 'approve' ? 'COC & POC approved — raise a variation order if needed, or the job will be closed out'
      : action === 'close_out' ? 'Job completed and closed out'
      : `${actorName ?? 'A manager'} → ${action.replace(/_/g, ' ')}`
    await push(admin, ids, ticket.company_id, title, msg, `/supplier/tickets/${ticket.id}`)
  }
  if (toRegion.includes(action) && ticket.region_id) {
    const { data } = await admin.from('regional_users').select('user_id').eq('region_id', ticket.region_id)
    const ids = (data ?? []).map(r => r.user_id)
    // "resubmit" = the store manager supplied the info the RM asked for.
    const regionMsg = action === 'resubmit' ? 'Information added'
      : action === 'accept_snag' ? `Snag fix proposed${when ? ` for ${when}` : ''} — approve to confirm`
      : `Update: ${action.replace(/_/g, ' ')}`
    await push(admin, ids, ticket.company_id, title, regionMsg, `/regional/tickets/${ticket.id}`)
  }
  if (toStore.includes(action) && ticket.created_by) {
    await push(admin, [ticket.created_by], ticket.company_id, title, storeMsg, `/client/tickets/${ticket.id}`)
  }
}

async function push(admin: Admin, ids: string[], companyId: string, title: string, message: string, link: string) {
  if (!ids.length) return
  await admin.from('notifications').insert(ids.map(id => ({ company_id: companyId, user_id: id, type: 'ticket_update', title, message, link })))
  void sendPushToMany(ids, { title, body: message, url: link })
}
