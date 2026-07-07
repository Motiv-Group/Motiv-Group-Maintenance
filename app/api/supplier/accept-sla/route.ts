import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'
import { supplierCtx } from '@/lib/supplier/ctx'
import { rateLimit } from '@/lib/rate-limit'
import { SLA_VERSION } from '@/lib/sla'

const BodySchema = z.object({
  sla_agreed: z.boolean().optional(),
  signed_name: z.string().optional(),
})

// POST /api/supplier/accept-sla — a supplier (re-)accepts the current SLA version.
// Drives the B12 re-acceptance gate: writes one supplier_sla_acceptances row per
// supplier the user belongs to, stamped with the current SLA_VERSION + typed name
// + ip. The gate (app/supplier/layout.tsx) clears once a row for SLA_VERSION exists.
export async function POST(request: Request) {
  const ctx = await supplierCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await rateLimit(`accept-sla:${ctx.userId}`, 10, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const signedName = String(parsed.data.signed_name ?? '').trim()
  if (parsed.data.sla_agreed !== true || !signedName) {
    return NextResponse.json({ error: 'Type your full name and tick the box to accept.' }, { status: 400 })
  }

  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
  const rows = ctx.supplierIds.map((supplier_id) => ({
    supplier_id, user_id: ctx.userId, sla_version: SLA_VERSION, signed_name: signedName, ip,
  }))
  const { error } = await ctx.admin.from('supplier_sla_acceptances').insert(rows)
  if (error) return NextResponse.json({ error: 'Could not record your acceptance — please try again.' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
