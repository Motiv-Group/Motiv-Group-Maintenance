import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { serverError } from '@/lib/api-error'
import { revalidatePath } from 'next/cache'
import { computePriority } from '@/lib/health/priority'

// PATCH /api/tickets/[id] — store manager edits their own ticket while it's still open.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  const role = prof?.role
  const { data: ticket } = await admin.from('tickets').select('created_by, store_id, region_id, status, company_id').eq('id', params.id).single()
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Tenant guard first — the ticket must be in the caller's company (the admin
  // client bypasses RLS). Prevents cross-company edits if a user is ever enrolled
  // in more than one company's link tables.
  if (!prof?.company_id || ticket.company_id !== prof.company_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Access: SM owner (creator or store-linked), the ticket's RM, or an executive.
  let allowed = role === 'executive' || role === 'system_admin'
  if (!allowed && role === 'regional_manager') {
    const { data: rl } = await admin.from('regional_users').select('region_id').eq('user_id', user.id)
    allowed = !!ticket.region_id && (rl ?? []).some(l => l.region_id === ticket.region_id)
  }
  if (!allowed) {
    let owns = ticket.created_by === user.id
    if (!owns) {
      const { data: link } = await admin.from('store_users').select('store_id').eq('user_id', user.id).eq('store_id', ticket.store_id).maybeSingle()
      owns = !!link
    }
    allowed = owns
  }
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (ticket.status !== 'open' && ticket.status !== 'info_requested') return NextResponse.json({ error: 'This ticket can no longer be edited' }, { status: 400 })

  const body = await request.json()
  const { title, description, category, operational_impact, photo_urls } = body
  if (!title || !description) return NextResponse.json({ error: 'Title and description are required' }, { status: 400 })

  const impact = String(operational_impact ?? 'none')
  const severity = impact === 'cannot_trade' || impact === 'safety_risk' ? 'critical'
    : impact === 'trading_affected' ? 'high'
    : impact === 'customer_visible' || impact === 'staff_inconvenience' ? 'medium' : 'low'
  const flags = {
    safety_risk_flag: impact === 'safety_risk',
    trading_impact_flag: impact === 'trading_affected' || impact === 'cannot_trade',
    customer_visible_flag: impact === 'customer_visible',
    staff_impact_flag: impact === 'staff_inconvenience',
  }
  // Managers can set priority directly (manual override); SM/owner keeps it derived from impact.
  const isManager = role === 'regional_manager' || role === 'executive' || role === 'system_admin'
  const priority = (isManager && ['P1', 'P2', 'P3', 'P4'].includes(String(body.priority)))
    ? String(body.priority)
    : computePriority({ severity, operational_impact: impact, ...flags })

  // Optional note describing the edit (e.g. "added extra work") — shown on the
  // audit trail. Cleared on a plain edit so a stale note can't linger.
  const editNote = typeof body.edit_note === 'string' && body.edit_note.trim() ? body.edit_note.trim() : null

  const now = new Date().toISOString()
  const update: Record<string, unknown> = { title, description, category, operational_impact: impact, severity, priority, ...flags, updated_at: now, edited_at: now, edited_by: user.id, edit_note: editNote }
  if (Array.isArray(photo_urls)) update.photo_urls = photo_urls

  const { data, error } = await admin.from('tickets').update(update).eq('id', params.id).select().single()
  if (error) return serverError(error)

  revalidatePath('/client'); revalidatePath('/client/tickets'); revalidatePath(`/client/tickets/${params.id}`)
  revalidatePath('/regional'); revalidatePath('/regional/tickets'); revalidatePath(`/regional/tickets/${params.id}`)
  revalidatePath(`/supplier/tickets/${params.id}`)
  return NextResponse.json({ ticket: data })
}

// DELETE /api/tickets/[id] — store manager deletes their own ticket while open.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('company_id').eq('id', user.id).single()
  const { data: ticket } = await admin.from('tickets').select('created_by, store_id, status, company_id').eq('id', params.id).single()
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!prof?.company_id || ticket.company_id !== prof.company_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let owns = ticket.created_by === user.id
  if (!owns) {
    const { data: link } = await admin.from('store_users').select('store_id').eq('user_id', user.id).eq('store_id', ticket.store_id).maybeSingle()
    owns = !!link
  }
  if (!owns) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (ticket.status !== 'open') return NextResponse.json({ error: 'Only open tickets can be deleted' }, { status: 400 })

  const { error } = await admin.from('tickets').delete().eq('id', params.id)
  if (error) return serverError(error)
  revalidatePath('/client'); revalidatePath('/client/tickets')
  return NextResponse.json({ success: true })
}
