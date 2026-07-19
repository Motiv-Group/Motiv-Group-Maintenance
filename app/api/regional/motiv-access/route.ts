import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { sendPushToMany } from '@/lib/push'

// POST /api/regional/motiv-access — a regional manager requests access to the
// shared Motiv supplier pool for their company. Creates/keeps a pending
// company_motiv_access row and notifies the system admins to approve it. No-op
// if already approved.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`motiv-access:${user.id}`, 10, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role, company_id, full_name').eq('id', user.id).single()
  if (me?.role !== 'regional_manager') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const companyId = me.company_id
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })

  const { data: existing } = await admin.from('company_motiv_access').select('status').eq('company_id', companyId).maybeSingle()
  if (existing?.status === 'approved') return NextResponse.json({ ok: true, status: 'approved' })
  if (existing?.status === 'pending') return NextResponse.json({ ok: true, status: 'pending' })

  await admin.from('company_motiv_access').upsert(
    { company_id: companyId, status: 'pending', requested_by: user.id, requested_at: new Date().toISOString(), decided_by: null, decided_at: null },
    { onConflict: 'company_id' },
  )

  // Notify system admins to review the request.
  const { data: company } = await admin.from('companies').select('name').eq('id', companyId).single()
  const { data: admins } = await admin.from('user_profiles').select('id').eq('role', 'system_admin')
  const adminIds = (admins ?? []).map(a => a.id)
  if (adminIds.length) {
    const title = 'Motiv supplier access requested'
    const message = `${company?.name ?? 'A company'} requested access to the Motiv supplier directory. Approve it in Suppliers.`
    await admin.from('notifications').insert(adminIds.map(id => ({ company_id: null, user_id: id, type: 'motiv_access', title, message, link: '/admin/suppliers' })))
    void sendPushToMany(adminIds, { title, body: message, url: '/admin/suppliers' })
  }

  await logAudit(admin, { actorId: user.id, companyId, action: 'motiv_access.request', entityType: 'company', entityId: companyId })
  revalidatePath('/admin/suppliers')
  return NextResponse.json({ ok: true, status: 'pending' })
}
