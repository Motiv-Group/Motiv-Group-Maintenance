import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { signManyUrls, signedUrl } from '@/lib/storage'

// GET /api/tickets/[id]/quote-context — the ticket detail a supplier needs to
// quote (description · photos · impact · store), for the Today-queue "Submit
// quote" pop-up to show the job BEFORE the upload form (mirrors the RM
// View & Assign context). Supplier-scoped: the caller must belong to a supplier
// org that is invited to (ticket_suppliers) or awarded (tickets.supplier_id) this
// ticket — never the whole company. Read-only.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'supplier') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // The caller's supplier orgs (a user can belong to more than one).
  const { data: links } = await admin.from('supplier_users').select('user_id, supplier_id').eq('user_id', user.id)
  const myOrgs = new Set((links ?? []).filter(l => l.user_id === user.id).map(l => l.supplier_id).filter((s): s is string => !!s))
  if (!myOrgs.size) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: t } = await admin.from('tickets')
    .select('id, title, category, description, operational_impact, priority, store_id, photo_urls, job_ref, supplier_id')
    .eq('id', id).single()
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Access: awarded to one of my orgs, or one of my orgs is invited on this ticket.
  let ok = !!t.supplier_id && myOrgs.has(t.supplier_id)
  if (!ok) {
    const { data: invites } = await admin.from('ticket_suppliers').select('supplier_id').eq('ticket_id', id)
    ok = (invites ?? []).some(i => i.supplier_id && myOrgs.has(i.supplier_id))
  }
  if (!ok) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })

  let storeName: string | null = null
  if (t.store_id) {
    const { data: store } = await admin.from('stores').select('name, sub_store, branch_code').eq('id', t.store_id).maybeSingle()
    storeName = store ? [store.branch_code, store.name, store.sub_store].filter(Boolean).join(' · ') || null : null
  }
  const photoUrls = Array.isArray(t.photo_urls) ? await signManyUrls(t.photo_urls as string[]) : []

  // The caller's own latest DECLINED quote on this ticket (for the re-quote flow —
  // shows what was declined + why alongside the job). Restricted to their orgs.
  const { data: declined } = await admin.from('quotes')
    .select('amount, amount_incl_vat, description, file_url, decline_reason, created_at, valid_until')
    .eq('ticket_id', id).eq('status', 'declined').in('supplier_id', [...myOrgs])
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  const declinedQuote = declined ? {
    amount: declined.amount, amountInclVat: declined.amount_incl_vat ?? null,
    description: declined.description ?? null, fileUrl: declined.file_url ? await signedUrl(declined.file_url) : null,
    declineReason: declined.decline_reason ?? null, validUntil: declined.valid_until ?? null, createdAt: declined.created_at,
  } : null

  return NextResponse.json({
    ticket: {
      title: t.title, category: t.category, description: t.description,
      impact: t.operational_impact, priority: t.priority, jobRef: t.job_ref,
      storeName, photoUrls,
    },
    declinedQuote,
  })
}
