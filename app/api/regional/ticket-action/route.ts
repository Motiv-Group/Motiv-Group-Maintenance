import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'

// POST /api/regional/ticket-action — regional manager operational actions.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!rateLimit(`rm-action:${user.id}`, 40, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json()
  const { ticketId, action } = body
  if (!ticketId || !action) return NextResponse.json({ error: 'ticketId and action required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  if (prof?.role !== 'regional_manager') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: links } = await admin.from('regional_users').select('region_id').eq('user_id', user.id)
  const regionIds = (links ?? []).map(l => l.region_id)
  const { data: ticket } = await admin.from('tickets').select('*').eq('id', ticketId).single()
  if (!ticket || !ticket.region_id || !regionIds.includes(ticket.region_id)) return NextResponse.json({ error: 'Not in your region' }, { status: 403 })
  const now = new Date().toISOString()

  const notifySupplier = async (title: string, message: string) => {
    if (!ticket.supplier_id) return
    const { data: su } = await admin.from('supplier_users').select('user_id').eq('supplier_id', ticket.supplier_id)
    const ids = (su ?? []).map(r => r.user_id)
    if (ids.length) {
      await admin.from('notifications').insert(ids.map(id => ({ company_id: ticket.company_id, user_id: id, type: 'ticket', title, message, link: `/supplier/tickets/${ticketId}` })))
      void sendPushToMany(ids, { title, body: message, url: `/supplier/tickets/${ticketId}` })
    }
  }
  const notifyStore = async (title: string, message: string) => {
    const { data: su } = await admin.from('store_users').select('user_id').eq('store_id', ticket.store_id)
    const ids = (su ?? []).map(r => r.user_id)
    if (ids.length) await admin.from('notifications').insert(ids.map(id => ({ company_id: ticket.company_id, user_id: id, type: 'ticket', title, message, link: `/client/tickets/${ticketId}` })))
  }

  switch (action) {
    case 'assign_supplier': {
      const supplierId = body.supplierId
      if (!supplierId) return NextResponse.json({ error: 'supplierId required' }, { status: 400 })
      const { data: sup } = await admin.from('suppliers').select('id, company_id').eq('id', supplierId).single()
      if (!sup || sup.company_id !== ticket.company_id) return NextResponse.json({ error: 'Invalid supplier' }, { status: 400 })
      await admin.from('tickets').update({ supplier_id: supplierId, last_internal_update_at: now }).eq('id', ticketId)
      ticket.supplier_id = supplierId
      await notifySupplier('New ticket assigned', `"${ticket.title}" was assigned to you.`)
      break
    }
    case 'approve_quote': {
      const quoteId = body.quoteId
      await admin.from('quotes').update({ status: 'accepted', updated_at: now }).eq('id', quoteId)
      await admin.from('tickets').update({ quote_decision_status: 'approved', quote_decided_at: now, status: 'in_progress', last_internal_update_at: now }).eq('id', ticketId)
      await notifySupplier('Quote approved', `Your quote on "${ticket.title}" was approved — proceed.`)
      break
    }
    case 'decline_quote': {
      const quoteId = body.quoteId
      await admin.from('quotes').update({ status: 'declined', decline_reason: body.reason ?? null, updated_at: now }).eq('id', quoteId)
      await admin.from('tickets').update({ quote_decision_status: 'rejected', quote_decided_at: now, last_internal_update_at: now }).eq('id', ticketId)
      await notifySupplier('Quote declined', `Your quote on "${ticket.title}" was declined.`)
      break
    }
    case 'signoff_accept': {
      await admin.from('signoffs').update({ status: 'accepted', reviewed_by: user.id, reviewed_at: now }).eq('id', body.signoffId)
      await admin.from('tickets').update({ status: 'completed', completed_at: now, closed_at: now, signoff_status: 'accepted', last_internal_update_at: now }).eq('id', ticketId)
      await notifySupplier('Job signed off', `"${ticket.title}" was accepted and completed.`)
      await notifyStore('Job completed', `"${ticket.title}" has been completed.`)
      break
    }
    case 'signoff_reject': {
      await admin.from('signoffs').update({ status: 'rejected', reject_reason: body.reason ?? null, reviewed_by: user.id, reviewed_at: now }).eq('id', body.signoffId)
      await admin.from('tickets').update({ status: 'in_progress', signoff_status: 'rejected', submitted_for_signoff_at: null, last_internal_update_at: now }).eq('id', ticketId)
      await notifySupplier('Sign-off rejected', `More evidence needed on "${ticket.title}".`)
      break
    }
    case 'raise_snag': {
      await admin.from('snags').insert({ company_id: ticket.company_id, ticket_id: ticketId, store_id: ticket.store_id, supplier_id: ticket.supplier_id, description: body.description ?? 'Snag', severity: body.severity ?? 'medium', status: 'open', owner_id: ticket.supplier_id ? null : user.id })
      await admin.from('tickets').update({ status: 'snag', last_internal_update_at: now }).eq('id', ticketId)
      await notifySupplier('Snag raised', `A snag was raised on "${ticket.title}".`)
      break
    }
    case 'resolve_snag': {
      if (!body.snagId) return NextResponse.json({ error: 'snagId required' }, { status: 400 })
      await admin.from('snags').update({ status: 'resolved' }).eq('id', body.snagId).eq('ticket_id', ticketId)
      const { count } = await admin.from('snags').select('id', { count: 'exact', head: true }).eq('ticket_id', ticketId).in('status', ['open', 'in_progress'])
      if ((count ?? 0) === 0 && ticket.status === 'snag') await admin.from('tickets').update({ status: 'in_progress', last_internal_update_at: now }).eq('id', ticketId)
      break
    }
    case 'request_update': {
      await admin.from('ticket_updates').insert({ ticket_id: ticketId, author_id: user.id, author_role: 'regional_manager', body: body.body ?? 'Please provide an update.' })
      await admin.from('tickets').update({ last_internal_update_at: now }).eq('id', ticketId)
      await notifySupplier('Update requested', `The regional manager requested an update on "${ticket.title}".`)
      break
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  revalidatePath(`/regional/tickets/${ticketId}`); revalidatePath('/regional'); revalidatePath('/regional/signoff'); revalidatePath('/regional/snag')
  return NextResponse.json({ ok: true })
}
