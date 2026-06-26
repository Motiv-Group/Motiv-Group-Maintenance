import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { supplierCtx } from '@/lib/supplier/ctx'

// PATCH /api/supplier/technicians/[id] — edit a technician's name/phone.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await supplierCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!rateLimit(`technicians:${ctx.userId}`, 30, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  // Ownership: the technician must belong to one of the caller's suppliers.
  const { data: tech } = await ctx.admin.from('technicians').select('id, supplier_id').eq('id', params.id).single()
  if (!tech || !ctx.supplierIds.includes(tech.supplier_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) { const n = String(body.name).trim(); if (!n) return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 }); patch.name = n }
  if (body.phone !== undefined) { const p = String(body.phone).trim(); if (!p) return NextResponse.json({ error: 'Phone cannot be empty.' }, { status: 400 }); patch.phone = p }

  const { error } = await ctx.admin.from('technicians').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath('/supplier/technicians')
  return NextResponse.json({ ok: true })
}

// DELETE /api/supplier/technicians/[id] — remove (soft-delete so scheduled tickets keep their reference).
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const ctx = await supplierCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: tech } = await ctx.admin.from('technicians').select('id, supplier_id').eq('id', params.id).single()
  if (!tech || !ctx.supplierIds.includes(tech.supplier_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await ctx.admin.from('technicians').update({ active: false, updated_at: new Date().toISOString() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath('/supplier/technicians')
  return NextResponse.json({ ok: true })
}
