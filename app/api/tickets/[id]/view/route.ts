import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'
import { rateLimit } from '@/lib/rate-limit'

// POST /api/tickets/[id]/view  { itemType, itemLabel } — record that the current user
// opened a specific item on a ticket (a photo, quote, COC…), for the audit trail. Only
// the first open of each distinct item per viewer is kept; repeat opens are no-ops.
const ITEMS = new Set(['photo', 'photos', 'quote', 'coc', 'invoice', 'attachment'])

const BodySchema = z.object({
  itemType: z.string().optional(),
  itemLabel: z.string().optional(),
})

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`view:${user.id}`, 120, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  const itemType = typeof body.itemType === 'string' && ITEMS.has(body.itemType) ? body.itemType : null
  const itemLabel = typeof body.itemLabel === 'string' ? body.itemLabel.slice(0, 120) : ''
  if (!itemType) return NextResponse.json({ ok: true })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  if (!prof?.company_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: ticket } = await admin.from('tickets').select('id, company_id').eq('id', params.id).single()
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // SEC-026: only a user in the ticket's own company may record a view on it —
  // otherwise any company user could forge cross-tenant rows in the ticket_views audit.
  if (ticket.company_id !== prof.company_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ignoreDuplicates keeps the FIRST view's timestamp (unique on ticket+viewer+type+label).
  await admin.from('ticket_views').upsert(
    [{ company_id: ticket.company_id, ticket_id: ticket.id, viewer_id: user.id, viewer_role: prof.role, item_type: itemType, item_label: itemLabel }],
    { onConflict: 'ticket_id,viewer_id,item_type,item_label', ignoreDuplicates: true },
  )
  return NextResponse.json({ ok: true })
}
