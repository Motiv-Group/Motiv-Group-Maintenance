import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { resolveRange, buildRegionalModel } from '@/lib/report-data'
import { addNarrative } from '@/lib/report-groq'
import { buildReportDocx } from '@/lib/report-docx'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'

export const runtime = 'nodejs'
export const maxDuration = 60

const BodySchema = z.object({
  period: z.string().optional(),
  from: z.any().optional(),
  to: z.any().optional(),
  storeIds: z.array(z.string()).optional(),
})

// POST /api/reports/regional — returns a .docx report across selected stores.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`report-regional:${user.id}`, 20, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role, full_name').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  const { period = 'month', from, to, storeIds = [] } = body
  const range = resolveRange(period, from, to)

  const admin = createAdminClient()
  // v3: the RM's stores are those in the region(s) they manage (regional_users).
  // buildRegionalModel expects each store keyed as { company_name?, sub_store? },
  // so we map the stores.`name` column onto `company_name`.
  const { data: regions } = await admin
    .from('regional_users').select('region_id').eq('user_id', user.id)
  const regionIds = (regions ?? []).map(r => r.region_id)
  const { data: stores } = regionIds.length
    ? await admin.from('stores').select('id, name, sub_store, branch_code').in('region_id', regionIds)
    : { data: [] as any[] }
  const ownStores = ((stores ?? []) as { id: string; name?: string; sub_store?: string }[])
    .map(s => ({ id: s.id, company_name: s.name, sub_store: s.sub_store }))
  const ownIds = new Set(ownStores.map(s => s.id))
  const selected = (Array.isArray(storeIds) && storeIds.length
    ? storeIds.filter((id: string) => ownIds.has(id))
    : ownStores.map(s => s.id))

  const storeMap = Object.fromEntries(ownStores.map(s => [s.id, s]))
  const model = await buildRegionalModel(admin, profile.full_name || 'Regional Manager', selected, storeMap, range)
  await addNarrative(model)

  const buf = await buildReportDocx(model)
  const filename = `regional-report-${new Date().toISOString().slice(0, 10)}.docx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
