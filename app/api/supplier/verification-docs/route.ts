import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { supplierCtx } from '@/lib/supplier/ctx'
import { signManyUrls } from '@/lib/storage'

const KINDS = ['cipc', 'vat_cert', 'insurance', 'qualification', 'other'] as const

// GET /api/supplier/verification-docs — the caller's own uploaded docs (signed URLs).
export async function GET() {
  const ctx = await supplierCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data } = await ctx.admin.from('supplier_verification_docs')
    .select('id, kind, url, uploaded_at').in('supplier_id', ctx.supplierIds).order('uploaded_at', { ascending: true })
  const rows = (data ?? []) as { id: string; kind: string; url: string; uploaded_at: string }[]
  const signed = await signManyUrls(rows.map(r => r.url))
  return NextResponse.json({ docs: rows.map((r, i) => ({ id: r.id, kind: r.kind, url: signed[i] ?? r.url, uploadedAt: r.uploaded_at })) })
}

// POST /api/supplier/verification-docs — record an uploaded verification document.
// The file itself is uploaded client-side to the private supplier-docs bucket;
// this stores the reference row the admin review reads.
export async function POST(request: Request) {
  const ctx = await supplierCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await rateLimit(`verification-docs:${ctx.userId}`, 20, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const b = await request.json().catch(() => ({}))
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
