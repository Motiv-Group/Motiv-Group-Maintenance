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
        if (body.supplierId) updates.supplier_id = body.supplierId
        break
      case 'request_evidence':
        updates.evidence_required = true
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
        await admin.from('quotes').update({ status: 'accepted' }).eq('ticket_id', ticketId).eq('status', 'pending')
        break
      case 'reject_quote':
        updates.quote_decision_status = 'rejected'; updates.quote_decided_at = now
        await admin.from('quotes').update({ status: 'declined' }).eq('ticket_id', ticketId).eq('status', 'pending')
        break
      case 'schedule': {
        const when = body.scheduledAt ? new Date(body.scheduledAt) : new Date(now)
        if (isNaN(when.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
        const H = ({ P1: 8, P2: 24, P3: 72, P4: 168 } as Record<string, number>)[ticket.priority] ?? 72
        let max = new Date(new Date(ticket.created_at).getTime() + H * 3600_000)
        if (max.getTime() <= Date.now()) max = new Date(Date.now() + H * 3600_000)
        const maxEnd = new Date(max); maxEnd.setHours(23, 59, 59, 999) // day-granular window
        if (when.getTime() < Date.now() - 5 * 60_000) return NextResponse.json({ error: 'Cannot schedule in the past.' }, { status: 400 })
        if (when.getTime() > maxEnd.getTime()) return NextResponse.json({ error: 'Scheduled date is beyond the allowed window for this priority.' }, { status: 400 })
        updates.scheduled_at = when.toISOString()
        // Optional: assign the technician who will attend (supplier's own roster).
        if (body.technicianId !== undefined) updates.technician_id = body.technicianId || null
        break
      }
      case 'start_work':
        updates.first_response_at = ticket.first_response_at ?? now; updates.attended_at = ticket.attended_at ?? now
        break
      case 'submit_variation': {
        const desc = String(body.description ?? '').trim()
        if (!desc) return NextResponse.json({ error: 'Variation description required' }, { status: 400 })
        await admin.from('ticket_variations').insert({ company_id: ticket.company_id, ticket_id: ticketId, supplier_id: ticket.supplier_id, description: desc, amount: body.amount ? Number(body.amount) : null, status: 'pending', submitted_by: user.id })
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
        // Approving the sign-off completes the ticket directly (no separate close-out step).
        updates.completed_at = now; updates.closed_out_at = now; updates.closed_out_by = user.id
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
      case 'resolve_snag':
        await admin.from('snags').update({ status: 'resolved' }).eq('ticket_id', ticketId).in('status', ['assigned', 'in_progress', 'open'])
        break
      case 'close_out':
        updates.completed_at = now; updates.closed_out_at = now; updates.closed_out_by = user.id
        break
      // validate / reject / resubmit / proceed_no_quote / request_evidence: status-only
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Action failed' }, { status: 400 })
  }

  // Blocker / pause / owner columns derived from the destination status, so the
  // stored signals stay in lock-step with the health engine's own derivation.
  Object.assign(updates, lifecycleFields(tr.to, now, tgt))

  const { error: upErr } = await admin.from('tickets').update(updates).eq('id', ticketId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  await notify(admin, action, ticket, prof.full_name ?? null)

  revalidatePath(`/supplier/tickets/${ticketId}`); revalidatePath('/supplier')
  revalidatePath('/regional'); revalidatePath('/regional/tickets'); revalidatePath('/client'); revalidatePath('/executive')
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
async function notify(admin: Admin, action: string, ticket: any, actorName: string | null) {
  const toSupplier = ['validate', 'request_quote', 'require_assessment', 'approve_quote', 'request_evidence', 'raise_snag', 'assign_snag', 'reject_variation']
  const toRegion   = ['submit_quote', 'submit_completion', 'submit_variation', 'resolve_snag', 'resubmit']
  const toStore    = ['request_info', 'close_out', 'reject']
  const title = `Ticket: ${ticket.title ?? 'Untitled'}`

  if (toSupplier.includes(action) && ticket.supplier_id) {
    const { data } = await admin.from('supplier_users').select('user_id').eq('supplier_id', ticket.supplier_id)
    const ids = (data ?? []).map(r => r.user_id)
    await push(admin, ids, ticket.company_id, title, `${actorName ?? 'A manager'} → ${action.replace(/_/g, ' ')}`, `/supplier/tickets/${ticket.id}`)
  }
  if (toRegion.includes(action) && ticket.region_id) {
    const { data } = await admin.from('regional_users').select('user_id').eq('region_id', ticket.region_id)
    const ids = (data ?? []).map(r => r.user_id)
    await push(admin, ids, ticket.company_id, title, `Update: ${action.replace(/_/g, ' ')}`, `/regional/tickets/${ticket.id}`)
  }
  if (toStore.includes(action) && ticket.created_by) {
    await push(admin, [ticket.created_by], ticket.company_id, title, `Update: ${action.replace(/_/g, ' ')}`, `/client/tickets/${ticket.id}`)
  }
}

async function push(admin: Admin, ids: string[], companyId: string, title: string, message: string, link: string) {
  if (!ids.length) return
  await admin.from('notifications').insert(ids.map(id => ({ company_id: companyId, user_id: id, type: 'ticket_update', title, message, link })))
  void sendPushToMany(ids, { title, body: message, url: link })
}
