import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'
import { rateLimit } from '@/lib/rate-limit'
import { supplierCtx } from '@/lib/supplier/ctx'
import { signManyUrls } from '@/lib/storage'

const KINDS = ['cipc', 'vat_cert', 'insurance', 'qualification', 'other'] as const

const BodySchema = z.object({
  kind: z.string().optional(),
  url: z.string().optional(),
})

// GET /api/supplier/verification-docs — the caller's own uploaded docs (signed URLs).
export async function GET() {
  const ctx = await supplierCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [{ data }, { data: sup }] = await Promise.all([
    ctx.admin.from('supplier_verification_docs')
      .select('id, kind, url, uploaded_at').in('supplier_id', ctx.supplierIds).order('uploaded_at', { ascending: true }),
    ctx.admin.from('suppliers').select('verification_status, is_motiv').in('id', ctx.supplierIds).limit(1).maybeSingle(),
  ])
  const rows = (data ?? []) as { id: string; kind: string; url: string; uploaded_at: string }[]
  const signed = await signManyUrls(rows.map(r => r.url))
  const verified = (sup as any)?.verification_status === 'verified' || (sup as any)?.is_motiv === true
  return NextResponse.json({
    verificationStatus: (sup as any)?.verification_status ?? null,
    verified,
    docs: rows.map((r, i) => ({ id: r.id, kind: r.kind, url: signed[i] ?? r.url, uploadedAt: r.uploaded_at })),
  })
}

// POST /api/supplier/verification-docs — record an uploaded verification document.
// The file itself is uploaded client-side to the private supplier-docs bucket;
// this stores the reference row the admin review reads.
export async function POST(request: Request) {
  const ctx = await supplierCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await rateLimit(`verification-docs:${ctx.userId}`, 20, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const b = parsed.data
  const kind = String(b.kind ?? '')
  const url = String(b.url ?? '')
  if (!(KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })
  if (!url || !url.includes('supplier-docs')) return NextResponse.json({ error: 'Invalid document reference' }, { status: 400 })

  const { error } = await ctx.admin.from('supplier_verification_docs').insert({
    supplier_id: ctx.supplierIds[0], uploaded_by: ctx.userId, kind, url,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
