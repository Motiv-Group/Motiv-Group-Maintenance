import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { serverError } from '@/lib/api-error'
import { rateLimit } from '@/lib/rate-limit'

// POST /api/ratings — RM rates the awarded supplier for a ticket (1–5 + comment).
// Used as a required step when accepting the COC/POC sign-off.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`rating:${user.id}`, 30, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json().catch(() => ({}))
  const score = Number(body.score)
  if (!Number.isInteger(score) || score < 1 || score > 5) return NextResponse.json({ error: 'Give a score from 1 to 5.' }, { status: 400 })
  if (typeof body.ticketId !== 'string') return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  const isIndividual = prof?.role === 'individual'
  if (!prof || (!isIndividual && (!prof.company_id || (prof.role !== 'regional_manager' && prof.role !== 'executive')))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ticket } = await admin.from('tickets').select('id, company_id, region_id, supplier_id, created_by').eq('id', body.ticketId).single()
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  if (isIndividual) {
    if (ticket.created_by !== user.id) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  } else {
    if (ticket.company_id !== prof.company_id) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    if (prof.role === 'regional_manager') {
      const { data: links } = await admin.from('regional_users').select('region_id').eq('user_id', user.id)
      if (!ticket.region_id || !(links ?? []).some(l => l.region_id === ticket.region_id)) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
    }
  }
  if (!ticket.supplier_id) return NextResponse.json({ error: 'No supplier assigned to rate.' }, { status: 400 })

  // One rating per supplier per ticket: re-rating (e.g. accepting again after a
  // snag fix) updates the existing row instead of stacking a duplicate.
  const fields = {
    company_id: ticket.company_id, ticket_id: ticket.id, supplier_id: ticket.supplier_id,
    rated_by: user.id, score, comment: typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null,
  }
  const { data: existing } = await admin.from('ratings').select('id').eq('ticket_id', ticket.id).eq('supplier_id', ticket.supplier_id).order('created_at', { ascending: false }).limit(1)
  const existingId = (existing ?? [])[0]?.id as string | undefined
  const { error } = existingId
    ? await admin.from('ratings').update(fields).eq('id', existingId)
    : await admin.from('ratings').insert(fields)
  if (error) return serverError(error)
  return NextResponse.json({ ok: true })
}
