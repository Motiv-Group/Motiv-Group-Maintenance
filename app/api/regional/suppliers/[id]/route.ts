import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireRegionalV3 } from '@/lib/health/guard'

// GET /api/regional/suppliers/[id] — extra detail for the RM supplier slide-out:
// contact info, jobs completed in-region, and recent rating comments. The
// headline performance numbers come from the dashboard row already on the page.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let companyId: string, regionIds: string[]
  try { ({ companyId, regionIds } = await requireRegionalV3()) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const admin = createAdminClient()
  const { data: sup } = await admin.from('suppliers')
    .select('id, company_name, contact_name, email, phone, address, trade, company_id')
    .eq('id', params.id).single()
  if (!sup || sup.company_id !== companyId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ count: jobsCompleted }, { data: ratingRows }] = await Promise.all([
    admin.from('tickets').select('id', { count: 'exact', head: true })
      .eq('supplier_id', params.id).eq('company_id', companyId).eq('status', 'completed')
      .in('region_id', regionIds.length ? regionIds : ['00000000-0000-0000-0000-000000000000']),
    admin.from('ratings').select('score, comment, created_at').eq('supplier_id', params.id).eq('company_id', companyId).order('created_at', { ascending: false }),
  ])

  const ratings = (ratingRows ?? []) as { score: number; comment: string | null; created_at: string }[]
  const count = ratings.length
  const avg = count ? ratings.reduce((s, r) => s + Number(r.score), 0) / count : null
  const comments = ratings.filter(r => r.comment && r.comment.trim()).map(r => ({ score: r.score, comment: r.comment, createdAt: r.created_at }))

  return NextResponse.json({
    supplier: {
      id: sup.id, name: sup.company_name, contactName: sup.contact_name ?? null,
      email: sup.email ?? null, phone: sup.phone ?? null, address: sup.address ?? null, trade: sup.trade ?? null,
    },
    jobsCompleted: jobsCompleted ?? 0,
    rating: { avg, count },
    comments,
  })
}
