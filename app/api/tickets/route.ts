import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { serverError } from '@/lib/api-error'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'
import { computePriority } from '@/lib/health/priority'
import { priorityWord, composeTicketTitle } from '@/lib/utils'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'

const BodySchema = z.object({
  description: z.string(),
  category: z.any().optional(),
  operational_impact: z.string().optional(),
  photo_urls: z.array(z.string()).optional(),
  title: z.any().optional(),
})

// POST /api/tickets — store manager logs a ticket (v3 model).
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`tickets:${user.id}`, 10, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  const { description, category, operational_impact = 'none', photo_urls = [] } = body
  if (!description) return NextResponse.json({ error: 'Description is required' }, { status: 400 })
  // Title is NOT typed by store staff (free text invites nonsense) — it is
  // auto-composed as "Category — first words of description" so lists stay
  // scannable. Callers that DO send a curated title (WhatsApp intake's LLM
  // title) keep it.
  const title = (typeof body.title === 'string' && body.title.trim() && body.title.trim() !== String(category ?? '').trim())
    ? body.title.trim()
    : composeTicketTitle(category, description)

  const admin = createAdminClient()
  const { data: profile } = await admin.from('user_profiles').select('company_id, role').eq('id', user.id).single()

  // Individuals (general public) own standalone tickets — no company / store / region.
  // Same tables + priority logic as a store ticket; just no hierarchy or RM notify.
  if (profile?.role === 'individual') {
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
    const { data: ticket, error } = await admin.from('tickets').insert({
      created_by: user.id, title, description, category,
      operational_impact: impact, severity, priority, ...flags, photo_urls, status: 'open',
      last_store_update_at: new Date().toISOString(),
    }).select().single()
    if (error) return serverError(error)
    revalidatePath('/individual')
    return NextResponse.json({ ticket }, { status: 201 })
  }

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
  if (error) return serverError(error)

  // SEC-038: the ticket is now committed. Notifying the region's manager(s) is a
  // BEST-EFFORT side effect — it must never fail the ticket-create response, or the
  // caller would see an error and retry, creating a DUPLICATE ticket. Isolate it in
  // try/catch (any failure is captured, not surfaced) and fire push fire-and-forget.
  if (store.region_id) {
    try {
      const { data: rms } = await admin.from('regional_users').select('user_id').eq('region_id', store.region_id)
      const ids = (rms ?? []).map(r => r.user_id)
      if (ids.length) {
        await admin.from('notifications').insert(ids.map(id => ({
          company_id: profile.company_id, user_id: id, ticket_id: ticket.id, type: 'new_ticket', title: title,
          message: `${store.name} just logged a ${priorityWord(priority)} priority ticket in your region: "${title}".`, link: `/regional/tickets/${ticket.id}`,
        })))
        void sendPushToMany(ids, { title: 'New Ticket', body: `${store.name}: ${title}`, url: `/regional/tickets/${ticket.id}` })
      }
    } catch (e) {
      Sentry.captureException(e) // notify failure is non-fatal; the ticket still exists
    }
  }

  revalidatePath('/client'); revalidatePath('/regional')
  return NextResponse.json({ ticket }, { status: 201 })
}
