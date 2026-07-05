import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { resolveRange, buildSupplierModel } from '@/lib/report-data'
import { addNarrative } from '@/lib/report-groq'
import { buildReportDocx } from '@/lib/report-docx'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/reports/supplier — returns a .docx report for the supplier.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`report-supplier:${user.id}`, 20, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role, full_name, company_name').eq('id', user.id).single()
  if (profile?.role !== 'supplier') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { period = 'month', from, to } = await request.json()
  const range = resolveRange(period, from, to)
  const name  = profile.company_name || profile.full_name || 'Supplier'

  const admin = createAdminClient()
  const model = await buildSupplierModel(admin, user.id, name, range)
  await addNarrative(model)

  const buf = await buildReportDocx(model)
  const filename = `supplier-report-${new Date().toISOString().slice(0, 10)}.docx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
