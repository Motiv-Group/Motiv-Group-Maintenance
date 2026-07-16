import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'

// POST /api/tickets/[id]/seen — bump the current user's "last seen" watermark for this
// ticket, so newer supplier updates read as NEW until the next time they open it.
// Idempotent upsert (one row per user+ticket); writes go through the service role.
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`seen:${user.id}`, 120, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  // Suppliers (incl. pool suppliers) and individuals have no/other company but still
  // view tickets they're on — this only tracks read state, so don't block them.
  if (!prof || (prof.role !== 'supplier' && prof.role !== 'individual' && !prof.company_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: ticket } = await admin.from('tickets').select('id, company_id, supplier_id, created_by').eq('id', params.id).single()
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // SEC-027: the caller must actually be related to this ticket, or any authenticated
  // user could forge cross-tenant rows in the ticket_reads audit table. Company users
  // must match the ticket's company; individuals must own it; suppliers must be linked
  // to the ticket's awarded supplier (supplier_users) or hold an active invite.
  let related = false
  if (prof.company_id) {
    related = ticket.company_id === prof.company_id
  } else if (prof.role === 'individual') {
    related = ticket.created_by === user.id
  } else if (prof.role === 'supplier') {
    const { data: links } = await admin.from('supplier_users').select('supplier_id').eq('user_id', user.id)
    const mine = (links ?? []).map(l => l.supplier_id)
    if (mine.length) {
      if (ticket.supplier_id && mine.includes(ticket.supplier_id)) {
        related = true
      } else {
        const { data: invite } = await admin.from('ticket_suppliers').select('id').eq('ticket_id', ticket.id).in('supplier_id', mine).limit(1).maybeSingle()
        related = !!invite
      }
    }
  }
  if (!related) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await admin.from('ticket_reads').upsert(
    [{ company_id: ticket.company_id, ticket_id: ticket.id, user_id: user.id, last_seen_at: new Date().toISOString() }],
    { onConflict: 'user_id,ticket_id' },
  )
  return NextResponse.json({ ok: true })
}
