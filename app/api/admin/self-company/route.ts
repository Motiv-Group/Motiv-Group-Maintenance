import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// POST /api/admin/self-company — link the signed-in system_admin to a company (existing
// or newly created). Deliberately does NOT require the admin to already have a company
// (that's the state this fixes), unlike /api/provision. system_admin only.
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'system_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!(await rateLimit(`self-company:${user.id}`, 20, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await req.json().catch(() => null)
  const newName = typeof body?.newCompanyName === 'string' ? body.newCompanyName.trim() : ''
  let targetId: string | null = typeof body?.companyId === 'string' ? body.companyId : null

  if (newName) {
    const { data: created, error } = await admin.from('companies').insert({ name: newName, active: true }).select('id').single()
    if (error || !created) return NextResponse.json({ error: error?.message ?? 'Could not create company' }, { status: 400 })
    targetId = created.id
  } else {
    if (!targetId) return NextResponse.json({ error: 'Choose a company or enter a new name' }, { status: 400 })
    const { data: exists } = await admin.from('companies').select('id').eq('id', targetId).single()
    if (!exists) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  const { error: upErr } = await admin.from('user_profiles').update({ company_id: targetId }).eq('id', user.id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  await logAudit(admin, { actorId: user.id, companyId: targetId, action: 'admin.set_self_company', entityType: 'company', entityId: targetId, metadata: { created: !!newName } })

  revalidatePath('/admin/hierarchy')
  revalidatePath('/admin/projects')
  return NextResponse.json({ ok: true, companyId: targetId })
}
