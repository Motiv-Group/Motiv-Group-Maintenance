import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'

// POST /api/supplier/ticket-action — supplier-side side effects that do NOT move the
// ticket through its lifecycle: post an update (add_update), upload evidence
// (add_evidence), confirm no further VOs (confirm_no_vos). All lifecycle STATUS
// changes go through /api/tickets/[id]/transition (lib/workflow) or the competitive
// commercial routes (submit-quote) — never here.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`supplier-action:${user.id}`, 30, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json()
  const { ticketId, action } = body
  if (!ticketId || !action) return NextResponse.json({ error: 'ticketId and action required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  if (prof?.role !== 'supplier') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: links } = await admin.from('supplier_users').select('supplier_id').eq('user_id', user.id)
  const supplierIds = (links ?? []).map(l => l.supplier_id)
  const { data: ticket } = await admin.from('tickets').select('*').eq('id', ticketId).single()
  if (!ticket || !ticket.supplier_id || !supplierIds.includes(ticket.supplier_id)) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  const now = new Date().toISOString()

  switch (action) {
    case 'add_update': {
      const text = String(body.body ?? '').trim()
      if (!text) return NextResponse.json({ error: 'Update text required' }, { status: 400 })
      await admin.from('ticket_updates').insert({ ticket_id: ticketId, author_id: user.id, author_role: 'supplier', body: text })
      await admin.from('tickets').update({ last_supplier_update_at: now, status: ticket.status === 'open' ? 'in_progress' : ticket.status }).eq('id', ticketId)
      // Tell the region's RMs there's a new update on the ticket (in-app + push), so
      // it's noticed without them re-opening the ticket. A photo update shows a
      // friendlier preview than the raw "📷 Progress photo: <url>" body.
      if (ticket.region_id) {
        const { data: rms } = await admin.from('regional_users').select('user_id').eq('region_id', ticket.region_id)
        const ids = (rms ?? []).map(r => r.user_id)
        if (ids.length) {
          const preview = /^📷\s*Progress photo:/.test(text) ? '📷 Sent a progress photo' : (text.length > 100 ? `${text.slice(0, 100)}…` : text)
          const title = `Supplier update: ${ticket.title ?? 'Ticket'}`
          const link = `/regional/tickets/${ticketId}`
          await admin.from('notifications').insert(ids.map(id => ({ company_id: ticket.company_id, user_id: id, type: 'ticket_update', title, message: preview, link })))
          void sendPushToMany(ids, { title, body: preview, url: link })
        }
      }
      break
    }
    case 'add_evidence': {
      const kind = String(body.kind) // before_photo | after_photo | coc | invoice
      const url = String(body.url ?? '')
      if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })
      await admin.from('ticket_evidence').insert({ ticket_id: ticketId, kind, url, uploaded_by: user.id })
      const flag = kind === 'before_photo' ? { before_photo_uploaded: true } : kind === 'after_photo' ? { after_photo_uploaded: true } : kind === 'coc' ? { completion_certificate_uploaded: true } : kind === 'invoice' ? { invoice_uploaded: true } : {}
      await admin.from('tickets').update({ ...flag, last_supplier_update_at: now }).eq('id', ticketId)
      break
    }
    case 'confirm_no_vos': {
      // At close-out the supplier confirms there are no further variation orders — this
      // un-blocks the RM's "Final close-out".
      if (!['approved_closeout', 'vo_declined'].includes(ticket.status)) return NextResponse.json({ error: 'Not at the close-out stage.' }, { status: 400 })
      const { error } = await admin.from('tickets').update({ vo_none_confirmed_at: now, last_supplier_update_at: now }).eq('id', ticketId)
      if (error) return NextResponse.json({ error: 'Could not confirm — the latest database migration may need to be applied.' }, { status: 503 })
      if (ticket.region_id) {
        const { data: rms } = await admin.from('regional_users').select('user_id').eq('region_id', ticket.region_id)
        const ids = (rms ?? []).map(r => r.user_id)
        if (ids.length) {
          await admin.from('notifications').insert(ids.map(id => ({ company_id: ticket.company_id, user_id: id, type: 'ticket_update', title: `Ticket: ${ticket.title ?? 'Ticket'}`, message: 'The supplier confirmed no further variation orders — ready for close-out.', link: `/regional/tickets/${ticketId}` })))
          void sendPushToMany(ids, { title: 'Ready for close-out', body: ticket.title ?? '', url: `/regional/tickets/${ticketId}` })
        }
      }
      break
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  revalidatePath(`/supplier/tickets/${ticketId}`); revalidatePath('/supplier'); revalidatePath('/regional'); revalidatePath(`/regional/tickets/${ticketId}`)
  return NextResponse.json({ ok: true })
}
