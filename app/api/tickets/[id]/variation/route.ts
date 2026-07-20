import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { signManyUrls } from '@/lib/storage'
import { rmOwnsTicket } from '@/lib/rm-ticket-access'

// GET /api/tickets/[id]/variation — the pending variation order for a ticket,
// used by the RM Today-queue "View & Approve" pop-up. RM-scoped (the ticket must
// be in one of the caller's regions), the individual owner, or system_admin.
// Read-only; the approve/decline actions go through the transition route.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  const { data: ticket } = await admin.from('tickets').select('id, company_id, region_id, store_id, created_by').eq('id', id).single()
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Resolver side only (SEC-045: executive is read-only elsewhere; VO decisions are RM/owner).
  let ok = false
  if (me?.role === 'system_admin') ok = true
  else if (me?.role === 'individual') ok = ticket.created_by === user.id
  else if (me?.role === 'regional_manager') ok = ticket.company_id === me.company_id && await rmOwnsTicket(admin, user.id, ticket)
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: vo } = await admin.from('ticket_variations')
    .select('id, description, amount, warranty, status, file_urls, created_at')
    .eq('ticket_id', id).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!vo) return NextResponse.json({ variation: null })

  const fileUrls = Array.isArray(vo.file_urls) ? await signManyUrls(vo.file_urls as string[]) : []
  return NextResponse.json({ variation: { ...vo, file_urls: fileUrls } })
}
