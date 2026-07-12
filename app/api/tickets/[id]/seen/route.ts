import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/tickets/[id]/seen — bump the current user's "last seen" watermark for this
// ticket, so newer supplier updates read as NEW until the next time they open it.
// Idempotent upsert (one row per user+ticket); writes go through the service role.
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  // Suppliers (incl. pool suppliers) and individuals have no/other company but still
  // view tickets they're on — this only tracks read state, so don't block them.
  if (!prof || (prof.role !== 'supplier' && prof.role !== 'individual' && !prof.company_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: ticket } = await admin.from('tickets').select('id, company_id').eq('id', params.id).single()
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await admin.from('ticket_reads').upsert(
    [{ company_id: ticket.company_id, ticket_id: ticket.id, user_id: user.id, last_seen_at: new Date().toISOString() }],
    { onConflict: 'user_id,ticket_id' },
  )
  return NextResponse.json({ ok: true })
}
