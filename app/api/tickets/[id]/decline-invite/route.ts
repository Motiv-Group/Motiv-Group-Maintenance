import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'

const BodySchema = z.object({ reason: z.string().optional().nullable() })

// POST /api/tickets/[id]/decline-invite — an invited supplier declines to quote.
// Marks their ticket_suppliers row 'declined'; the ticket itself is unaffected.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`decline-invite:${user.id}`, 30, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  if (prof?.role !== 'supplier') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ticket } = await admin.from('tickets').select('id, company_id, region_id, title').eq('id', params.id).single()
  // Suppliers work across companies (incl. Motiv-pool / individual company-null
  // tickets); the invite check below is the real access gate.
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  const { data: myLinks } = await admin.from('supplier_users').select('supplier_id').eq('user_id', user.id)
  const mySupplierIds = (myLinks ?? []).map(l => l.supplier_id)
  const { data: invite } = await admin.from('ticket_suppliers').select('id, status').eq('ticket_id', ticket.id).in('supplier_id', mySupplierIds.length ? mySupplierIds : ['00000000-0000-0000-0000-000000000000']).maybeSingle()
  if (!invite) return NextResponse.json({ error: 'You are not invited to this ticket.' }, { status: 403 })

  const now = new Date().toISOString()
  await admin.from('ticket_suppliers').update({ status: 'declined', decline_reason: body.reason ?? null, responded_at: now }).eq('id', invite.id)

  revalidatePath('/supplier');revalidatePath(`/supplier/tickets/${ticket.id}`);revalidatePath(`/regional/tickets/${ticket.id}`)
  return NextResponse.json({ ok: true })
}
