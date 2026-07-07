import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'

const BodySchema = z.object({
  action: z.string().optional(),
  supplierId: z.string().optional(),
})

// POST /api/admin/suppliers — system_admin reviews self-signup suppliers.
//   approve: verification_status 'verified' + is_motiv → enters the Motiv pool
//            (assignable to Individual jobs and visible as a verified supplier).
//   reject:  verification_status 'rejected' + active=false → cannot receive work;
//            the login stays so they can read the outcome notification.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`admin-suppliers:${user.id}`, 30, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'system_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  const action = String(body.action ?? '')
  const supplierId = String(body.supplierId ?? '')
  if (!supplierId) return NextResponse.json({ error: 'Supplier required' }, { status: 400 })

  const { data: sup } = await admin.from('suppliers').select('id, company_name, verification_status, source').eq('id', supplierId).single()
  if (!sup) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })

  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const patch = action === 'approve'
    ? { verification_status: 'verified', is_motiv: true, active: true }
    : { verification_status: 'rejected', is_motiv: false, active: false }
  const { error } = await admin.from('suppliers').update(patch).eq('id', supplierId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await logAudit(admin, { actorId: user.id, action: `supplier.${action}`, entityType: 'supplier', entityId: supplierId, metadata: { companyName: sup.company_name, to: patch.verification_status } })

  // Tell the supplier's users the outcome.
  const { data: links } = await admin.from('supplier_users').select('user_id').eq('supplier_id', supplierId)
  const ids = (links ?? []).map(l => l.user_id)
  if (ids.length) {
    const title = action === 'approve' ? 'You are live on Motiv 🎉' : 'Registration update'
    const message = action === 'approve'
      ? `${sup.company_name} is verified — you can now receive job invitations.`
      : `${sup.company_name}'s registration was not approved. Reply to your welcome email if you believe this is an error.`
    await admin.from('notifications').insert(ids.map(id => ({ company_id: null, user_id: id, type: 'supplier_review', title, message, link: '/supplier' })))
    void sendPushToMany(ids, { title, body: message, url: '/supplier' })
  }

  revalidatePath('/admin/suppliers')
  return NextResponse.json({ ok: true })
}
