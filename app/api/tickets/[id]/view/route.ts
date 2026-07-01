import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/tickets/[id]/view — record that the current user opened one or more of
// a ticket's key items (its quote, photos, COC/POC) for the audit trail. Only the
// first view per (ticket, viewer, item) is kept; repeat opens are no-ops.
const ITEMS = new Set(['quote', 'photos', 'coc'])

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const raw: unknown[] = Array.isArray(body.items) ? body.items : []
  const items = [...new Set(raw.filter((i): i is string => typeof i === 'string' && ITEMS.has(i)))]
  if (!items.length) return NextResponse.json({ ok: true })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  if (!prof?.company_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: ticket } = await admin.from('tickets').select('id, company_id').eq('id', params.id).single()
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const rows = items.map(item_type => ({ company_id: ticket.company_id, ticket_id: ticket.id, viewer_id: user.id, viewer_role: prof.role, item_type }))
  // ignoreDuplicates keeps the FIRST view's timestamp (unique on ticket+viewer+item).
  await admin.from('ticket_views').upsert(rows, { onConflict: 'ticket_id,viewer_id,item_type', ignoreDuplicates: true })
  return NextResponse.json({ ok: true })
}
