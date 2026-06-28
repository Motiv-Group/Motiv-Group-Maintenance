import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'
import { computePriority } from '@/lib/health/priority'
import { priorityWord } from '@/lib/utils'

// POST /api/tickets — store manager logs a ticket (v3 model).
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!rateLimit(`tickets:${user.id}`, 10, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json()
  const { title, description, category, operational_impact = 'none', photo_urls = [] } = body
  if (!title || !description) return NextResponse.json({ error: 'Title and description are required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('user_profiles').select('company_id').eq('id', user.id).single()
  const { data: link } = await admin.from('store_users').select('store_id').eq('user_id', user.id).limit(1).single()
  if (!profile?.company_id || !link?.store_id) return NextResponse.json({ error: 'Your account is not linked to a store yet.' }, { status: 403 })
  const { data: store } = await admin.from('stores').select('id, region_id, region_code, branch_code, name, closed_at').eq('id', link.store_id).single()
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })
  if (store.closed_at) return NextResponse.json({ error: 'Your store is closed and cannot submit new tickets.' }, { status: 403 })

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

  const { data: ticket, error } = await supabase.from('tickets').insert({
    company_id: profile.company_id, store_id: store.id, region_id: store.region_id, region_code: store.region_code,
    branch_code: store.branch_code, created_by: user.id, title, description, category,
    operational_impact: impact, severity, priority, ...flags, photo_urls, status: 'open',
    last_store_update_at: new Date().toISOString(),
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // notify the region's manager(s)
  if (store.region_id) {
    const { data: rms } = await admin.from('regional_users').select('user_id').eq('region_id', store.region_id)
    const ids = (rms ?? []).map(r => r.user_id)
    if (ids.length) {
      await admin.from('notifications').insert(ids.map(id => ({
        company_id: profile.company_id, user_id: id, type: 'new_ticket', title: 'New Ticket in Your Region',
        message: `${store.name} logged a ${priorityWord(priority)} ticket: "${title}"`, link: `/regional/tickets/${ticket.id}`,
      })))
      void sendPushToMany(ids, { title: 'New Ticket', body: `${store.name}: ${title}`, url: `/regional/tickets/${ticket.id}` })
    }
  }

  revalidatePath('/client'); revalidatePath('/regional')
  return NextResponse.json({ ticket }, { status: 201 })
}
