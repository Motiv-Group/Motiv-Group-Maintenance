import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { computePriority } from '@/lib/health/priority'

// PATCH /api/tickets/[id] — store manager edits their own ticket while it's still open.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: ticket } = await admin.from('tickets').select('created_by, store_id, status').eq('id', params.id).single()
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Owner = the creator, or any manager linked to the ticket's store.
  let owns = ticket.created_by === user.id
  if (!owns) {
    const { data: link } = await admin.from('store_users').select('store_id').eq('user_id', user.id).eq('store_id', ticket.store_id).maybeSingle()
    owns = !!link
  }
  if (!owns) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (ticket.status !== 'open') return NextResponse.json({ error: 'Only open tickets can be edited' }, { status: 400 })

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
  const priority = computePriority({ severity, operational_impact: impact, ...flags })

  const update: Record<string, unknown> = { title, description, category, operational_impact: impact, severity, priority, ...flags, updated_at: new Date().toISOString() }
  if (Array.isArray(photo_urls)) update.photo_urls = photo_urls

  const { data, error } = await admin.from('tickets').update(update).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/client'); revalidatePath('/client/tickets'); revalidatePath(`/client/tickets/${params.id}`)
  return NextResponse.json({ ticket: data })
}

// DELETE /api/tickets/[id] — store manager deletes their own ticket while open.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: ticket } = await admin.from('tickets').select('created_by, store_id, status').eq('id', params.id).single()
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let owns = ticket.created_by === user.id
  if (!owns) {
    const { data: link } = await admin.from('store_users').select('store_id').eq('user_id', user.id).eq('store_id', ticket.store_id).maybeSingle()
    owns = !!link
  }
  if (!owns) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (ticket.status !== 'open') return NextResponse.json({ error: 'Only open tickets can be deleted' }, { status: 400 })

  const { error } = await admin.from('tickets').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath('/client'); revalidatePath('/client/tickets')
  return NextResponse.json({ success: true })
}
