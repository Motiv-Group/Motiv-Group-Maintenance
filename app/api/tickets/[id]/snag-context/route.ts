import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { signManyUrls, signedUrl } from '@/lib/storage'

// GET /api/tickets/[id]/snag-context — the snagged completion (the latest
// rejected sign-off) + the manager's reason, for the supplier Today-queue
// "View snag" pop-up to show WHAT was sent back. Supplier-scoped: the caller
// must be a user of the AWARDED supplier org. Read-only.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'supplier') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: t } = await admin.from('tickets').select('id, supplier_id').eq('id', id).single()
  if (!t || !t.supplier_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // The caller must belong to the awarded supplier org.
  const { data: links } = await admin.from('supplier_users').select('user_id, supplier_id').eq('user_id', user.id).eq('supplier_id', t.supplier_id)
  if (!(links ?? []).some(l => l.user_id === user.id && l.supplier_id === t.supplier_id)) {
    return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  }

  // The snagged submission = the latest rejected sign-off.
  const { data: s } = await admin.from('signoffs')
    .select('id, before_urls, after_urls, coc_url, invoice_url, notes, reject_reason, created_at, reviewed_at')
    .eq('ticket_id', id).eq('status', 'rejected').order('reviewed_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
  if (!s) return NextResponse.json({ signoff: null })

  const [beforeUrls, afterUrls, cocUrl, invoiceUrl] = await Promise.all([
    Array.isArray(s.before_urls) ? signManyUrls(s.before_urls as string[]) : Promise.resolve([]),
    Array.isArray(s.after_urls) ? signManyUrls(s.after_urls as string[]) : Promise.resolve([]),
    s.coc_url ? signedUrl(s.coc_url) : Promise.resolve(null),
    s.invoice_url ? signedUrl(s.invoice_url) : Promise.resolve(null),
  ])
  return NextResponse.json({
    signoff: { beforeUrls, afterUrls, cocUrl, invoiceUrl, notes: s.notes, rejectReason: s.reject_reason, submittedAt: s.created_at, reviewedAt: s.reviewed_at },
  })
}
