import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { resolveRange, buildRegionalModel } from '@/lib/report-data'
import { addNarrative } from '@/lib/report-groq'
import { buildReportDocx } from '@/lib/report-docx'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/reports/regional — returns a .docx report across selected stores.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { period = 'month', from, to, storeIds = [] } = await request.json()
  const range = resolveRange(period, from, to)

  const admin = createAdminClient()
  // Only the RM's own stores — ignore any others passed in.
  const { data: stores } = await admin
    .from('profiles').select('id, company_name, sub_store')
    .eq('regional_manager_id', user.id).in('role', ['store_manager', 'client'])
  const ownStores = (stores ?? []) as { id: string; company_name?: string; sub_store?: string }[]
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
