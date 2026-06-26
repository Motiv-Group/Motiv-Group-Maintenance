import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { supplierCtx } from '@/lib/supplier/ctx'

// POST /api/supplier/technicians — add a technician (name + phone).
export async function POST(request: Request) {
  const ctx = await supplierCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!rateLimit(`technicians:${ctx.userId}`, 30, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  const phone = String(body.phone ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Technician name is required.' }, { status: 400 })
  if (!phone) return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 })

  const { error } = await ctx.admin.from('technicians').insert({
    company_id: ctx.companyId, supplier_id: ctx.supplierIds[0], name, phone, active: true,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath('/supplier/technicians')
  return NextResponse.json({ ok: true })
}
