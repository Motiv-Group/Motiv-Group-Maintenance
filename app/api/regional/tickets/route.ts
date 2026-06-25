import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'
import { computePriority } from '@/lib/health/priority'
import { loadSlaResolver } from '@/lib/health/data'

// POST /api/regional/tickets — an RM logs a ticket on behalf of a store in their
// region (same intake as the SM, plus a store selector + optional supplier invite).
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!rateLimit(`rm-tickets:${user.id}`, 20, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json()
  const { storeId, title, description, category, operational_impact = 'none', photo_urls = [] } = body
  if (!storeId || !title || !description) return NextResponse.json({ error: 'Store, title and description are required' }, { status: 400 })
  const supplierIds: string[] = Array.isArray(body.supplierIds) ? body.supplierIds.filter((s: unknown) => typeof s === 'string') : []

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id, full_name').eq('id', user.id).single()
  if (!prof?.company_id || (prof.role !== 'regional_manager' && prof.role !== 'executive')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: store } = await admin.from('stores').select('id, region_id, region_code, branch_code, name, company_id, closed_at').eq('id', storeId).single()
  if (!store || store.company_id !== prof.company_id) return NextResponse.json({ error: 'Store not found' }, { status: 404 })
  if (store.closed_at) return NextResponse.json({ error: 'That store is closed.' }, { status: 400 })
  if (prof.role === 'regional_manager') {
    const { data: links } = await admin.from('regional_users').select('region_id').eq('user_id', user.id)
    if (!store.region_id || !(links ?? []).some(l => l.region_id === store.region_id)) return NextResponse.json({ error: 'That store is not in your region.' }, { status: 403 })
  }

  const impact = String(operational_impact)
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
  const now = new Date().toISOString()

  const { data: ticket, error } = await admin.from('tickets').insert({
    company_id: prof.company_id, store_id: store.id, region_id: store.region_id, region_code: store.region_code,
    branch_code: store.branch_code, created_by: user.id, title, description, category,
    operational_impact: impact, severity, priority, ...flags, photo_urls, status: 'open',
    last_internal_update_at: now,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Optional: immediately invite suppliers to quote.
  if (supplierIds.length) {
    const rules = await loadSlaResolver(admin, prof.company_id)
    const tgt = rules(priority as 'P1' | 'P2' | 'P3' | 'P4')
    await admin.from('ticket_suppliers').upsert(
      supplierIds.map(supplier_id => ({ company_id: prof.company_id, ticket_id: ticket.id, supplier_id, status: 'invited', invited_at: now })),
      { onConflict: 'ticket_id,supplier_id', ignoreDuplicates: true },
    )
    await admin.from('tickets').update({
      status: 'assigned', quote_required: true, quote_requested_at: now, quote_due_at: new Date(Date.now() + tgt.quote_due_mins * 60_000).toISOString(),
      current_blocker: 'supplier_action', blocker_owner_type: 'supplier', blocker_started_at: now,
    }).eq('id', ticket.id)
    const { data: su } = await admin.from('supplier_users').select('user_id').in('supplier_id', supplierIds)
    const ids = Array.from(new Set((su ?? []).map(r => r.user_id)))
    if (ids.length) {
      await admin.from('notifications').insert(ids.map(id => ({ company_id: prof.company_id, user_id: id, type: 'ticket_update', title: `Ticket: ${title}`, message: 'You have been invited to quote.', link: '/supplier/tickets' })))
      void sendPushToMany(ids, { title: 'New quote request', body: title, url: '/supplier/tickets' })
    }
  }

  // Notify the store's managers so it shows on their side.
  const { data: sm } = await admin.from('store_users').select('user_id').eq('store_id', store.id)
  const smIds = (sm ?? []).map(r => r.user_id)
  if (smIds.length) {
    await admin.from('notifications').insert(smIds.map(id => ({ company_id: prof.company_id, user_id: id, type: 'new_ticket', title: 'New ticket logged', message: `${prof.full_name ?? 'Your regional manager'} logged: "${title}"`, link: '/client/tickets' })))
    void sendPushToMany(smIds, { title: 'New ticket', body: title, url: '/client/tickets' })
  }

  revalidatePath('/regional'); revalidatePath('/regional/tickets'); revalidatePath('/client'); revalidatePath('/supplier')
  return NextResponse.json({ ticket }, { status: 201 })
}
