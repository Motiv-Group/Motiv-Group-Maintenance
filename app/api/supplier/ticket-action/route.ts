import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'

// POST /api/supplier/ticket-action — supplier-side mutations.
// Suppliers can acknowledge/update/quote/upload evidence and SUBMIT FOR SIGN-OFF.
// They can NOT mark a job completed — the company confirms via sign-off.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!rateLimit(`supplier-action:${user.id}`, 30, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

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
    case 'acknowledge': {
      await admin.from('tickets').update({ first_response_at: ticket.first_response_at ?? now, attended_at: ticket.attended_at ?? now, status: ticket.status === 'open' ? 'in_progress' : ticket.status, last_supplier_update_at: now }).eq('id', ticketId)
      break
    }
    case 'add_update': {
      const text = String(body.body ?? '').trim()
      if (!text) return NextResponse.json({ error: 'Update text required' }, { status: 400 })
      await admin.from('ticket_updates').insert({ ticket_id: ticketId, author_id: user.id, author_role: 'supplier', body: text })
      await admin.from('tickets').update({ last_supplier_update_at: now, status: ticket.status === 'open' ? 'in_progress' : ticket.status }).eq('id', ticketId)
      break
    }
    case 'add_quote': {
      const amount = Number(body.amount)
      if (!amount || amount <= 0) return NextResponse.json({ error: 'Valid amount required' }, { status: 400 })
      await admin.from('quotes').insert({ company_id: ticket.company_id, ticket_id: ticketId, supplier_id: ticket.supplier_id, submitted_by: user.id, amount, amount_incl_vat: body.amount_incl_vat ?? null, file_url: body.file_url ?? null, status: 'pending', description: body.description ?? null })
      await admin.from('tickets').update({ quote_submitted_at: now, quote_value: amount, quote_decision_required: true, quote_decision_status: 'pending', status: 'quoted', last_supplier_update_at: now }).eq('id', ticketId)
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
    case 'submit_signoff': {
      const { data: ev } = await admin.from('ticket_evidence').select('kind, url').eq('ticket_id', ticketId)
      const before = (ev ?? []).filter(e => e.kind === 'before_photo').map(e => e.url)
      const after = (ev ?? []).filter(e => e.kind === 'after_photo').map(e => e.url)
      const coc = (ev ?? []).find(e => e.kind === 'coc')?.url ?? null
      const invoice = (ev ?? []).find(e => e.kind === 'invoice')?.url ?? null
      await admin.from('signoffs').insert({ company_id: ticket.company_id, ticket_id: ticketId, supplier_id: ticket.supplier_id, before_urls: before, after_urls: after, coc_url: coc, invoice_url: invoice, status: 'submitted', notes: body.notes ?? null })
      await admin.from('tickets').update({ status: 'submitted_for_signoff', submitted_for_signoff_at: now, signoff_status: 'submitted', last_supplier_update_at: now }).eq('id', ticketId)
      // notify region RMs
      if (ticket.region_id) {
        const { data: rms } = await admin.from('regional_users').select('user_id').eq('region_id', ticket.region_id)
        const ids = (rms ?? []).map(r => r.user_id)
        if (ids.length) await admin.from('notifications').insert(ids.map(id => ({ company_id: ticket.company_id, user_id: id, type: 'signoff_request', title: 'Job submitted for sign-off', message: `"${ticket.title}" is ready for your sign-off.`, link: `/regional/tickets/${ticketId}` })))
      }
      break
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  revalidatePath(`/supplier/tickets/${ticketId}`); revalidatePath('/supplier'); revalidatePath('/regional')
  return NextResponse.json({ ok: true })
}
