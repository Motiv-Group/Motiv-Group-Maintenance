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
  const { data: ticket } = await admin.from('tickets').select('id, company_id, region_id, store_id, created_by, job_ref, category, supplier_id').eq('id', id).single()
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Resolver side only (SEC-045: executive is read-only elsewhere; VO decisions are RM/owner).
  let ok = false
  if (me?.role === 'system_admin') ok = true
  else if (me?.role === 'individual') ok = ticket.created_by === user.id
  else if (me?.role === 'regional_manager') ok = ticket.company_id === me.company_id && await rmOwnsTicket(admin, user.id, ticket)
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: vo } = await admin.from('ticket_variations')
    .select('id, supplier_id, description, amount, amount_incl_vat, status, file_urls, created_at')
    .eq('ticket_id', id).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!vo) return NextResponse.json({ variation: null })

  // Pop-up header meta: the submitting supplier org's name + the site name.
  const supplierOrgId = vo.supplier_id ?? ticket.supplier_id ?? null
  const [fileUrls, supplierRes, storeRes] = await Promise.all([
    Array.isArray(vo.file_urls) ? signManyUrls(vo.file_urls as string[]) : Promise.resolve([] as string[]),
    supplierOrgId ? admin.from('suppliers').select('company_name').eq('id', supplierOrgId).maybeSingle() : Promise.resolve({ data: null as { company_name: string } | null }),
    ticket.store_id ? admin.from('stores').select('name').eq('id', ticket.store_id).maybeSingle() : Promise.resolve({ data: null as { name: string } | null }),
  ])
  return NextResponse.json({
    variation: {
      id: vo.id, description: vo.description, amount: vo.amount, amount_incl_vat: vo.amount_incl_vat,
      file_urls: fileUrls, created_at: vo.created_at,
      supplierName: supplierRes.data?.company_name ?? 'Supplier',
      jobRef: ticket.job_ref ?? null,
      storeName: storeRes.data?.name ?? null,
      category: ticket.category ?? null,
    },
  })
}
