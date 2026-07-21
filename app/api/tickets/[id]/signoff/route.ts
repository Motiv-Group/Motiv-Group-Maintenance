import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { signedUrl } from '@/lib/storage'
import { rmOwnsTicket } from '@/lib/rm-ticket-access'

// GET /api/tickets/[id]/signoff — the submission currently under review for a
// ticket (proof-of-completion photos, COC, invoice, notes), used by the Today
// queue's "Sign off" pop-up. RM-scoped: the ticket must be in one of the
// caller's regions and actually awaiting sign-off.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  if (me?.role !== 'regional_manager') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ticket } = await admin.from('tickets').select('id, company_id, region_id, store_id, status, job_ref, category, supplier_id').eq('id', id).single()
  if (!ticket || ticket.company_id !== me.company_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await rmOwnsTicket(admin, user.id, ticket))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: signoffs } = await admin.from('signoffs')
    .select('id, status, supplier_id, before_urls, after_urls, coc_url, invoice_url, notes, created_at')
    .eq('ticket_id', id).order('created_at', { ascending: true })

  const all = signoffs ?? []
  // "Submission #N" is the 1-based position across every submission, oldest first.
  const noById = new Map<string, number>()
  all.forEach((s, i) => noById.set(s.id, i + 1))
  const pending = all.filter(s => ['submitted', 'awaiting_regional', 'awaiting_store'].includes(s.status))
  const s = pending[pending.length - 1] ?? null   // most recent still under review
  if (!s) return NextResponse.json({ submission: null })

  // Sign the private-bucket attachments (each distinct url once).
  const cache = new Map<string, Promise<string | null>>()
  const signOne = (u: string | null | undefined): Promise<string | null> => { if (!u) return Promise.resolve(null); let p = cache.get(u); if (!p) { p = signedUrl(u); cache.set(u, p) } return p }
  const signList = async (list: string[] | null): Promise<string[]> => Array.isArray(list) ? (await Promise.all(list.map(signOne))).filter((x): x is string => !!x) : []
  // Pop-up header meta: the submitting supplier org's name + the site name.
  const supplierOrgId = s.supplier_id ?? ticket.supplier_id ?? null
  const [beforeUrls, afterUrls, cocUrl, invoiceUrl, supplierRes, storeRes] = await Promise.all([
    signList(s.before_urls), signList(s.after_urls), signOne(s.coc_url), signOne(s.invoice_url),
    supplierOrgId ? admin.from('suppliers').select('company_name').eq('id', supplierOrgId).maybeSingle() : Promise.resolve({ data: null as { company_name: string } | null }),
    ticket.store_id ? admin.from('stores').select('name').eq('id', ticket.store_id).maybeSingle() : Promise.resolve({ data: null as { name: string } | null }),
  ])

  return NextResponse.json({
    submission: {
      id: s.id, label: `Submission #${noById.get(s.id) ?? '?'}`, createdAt: s.created_at,
      beforeUrls, afterUrls, cocUrl, invoiceUrl, notes: s.notes ?? null,
      supplierName: supplierRes.data?.company_name ?? 'Supplier',
      jobRef: ticket.job_ref ?? null,
      storeName: storeRes.data?.name ?? null,
      category: ticket.category ?? null,
    },
  })
}
