import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'

const BodySchema = z.object({
  action: z.string(),
  companyId: z.string(),
  userId: z.string().optional(),
  regionIds: z.array(z.string()).optional(),
  storeIds: z.array(z.string()).optional(),
  execUserIds: z.array(z.string()).optional(),
})

// POST /api/admin/hierarchy — system_admin manages the org-chart links for one
// company: an RM's regions (regional_users), an SM's stores (store_users), and an
// RM's executive(s) (rm_executive_links). Each action REPLACES that user's link
// set (multi-assign). Everything is scoped to the company (cross-company ids are
// rejected even though the admin client bypasses RLS).
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`admin-hierarchy:${user.id}`, 60, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'system_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const { action, companyId } = parsed.data
  const bad = (e: string) => NextResponse.json({ error: e }, { status: 400 })

  // Confirm the target user is in this company with the expected role.
  async function requireUser(userId: string, role: string): Promise<boolean> {
    const { data } = await admin.from('user_profiles').select('id').eq('id', userId).eq('company_id', companyId).eq('role', role).maybeSingle()
    return !!data
  }

  const done = (message: string) => {
    revalidatePath(`/admin/hierarchy/${companyId}`); revalidatePath('/admin/hierarchy')
    return NextResponse.json({ ok: true, message })
  }

  try {
    if (action === 'set_rm_regions') {
      const rmUserId = String(parsed.data.userId ?? '')
      const regionIds = parsed.data.regionIds ?? []
      if (!rmUserId || !(await requireUser(rmUserId, 'regional_manager'))) return bad('Regional manager not in this company.')
      if (regionIds.length) {
        const { data: valid } = await admin.from('regions').select('id').eq('company_id', companyId).in('id', regionIds)
        if ((valid ?? []).length !== regionIds.length) return bad('One or more regions are not in this company.')
      }
      await admin.from('regional_users').delete().eq('user_id', rmUserId)
      if (regionIds.length) await admin.from('regional_users').insert(regionIds.map(region_id => ({ user_id: rmUserId, region_id })))
      await logAudit(admin, { actorId: user.id, companyId, action: 'admin.set_rm_regions', entityType: 'user', entityId: rmUserId, metadata: { count: regionIds.length } })
      return done('Regions updated.')
    }

    if (action === 'set_sm_stores') {
      const smUserId = String(parsed.data.userId ?? '')
      const storeIds = parsed.data.storeIds ?? []
      if (!smUserId || !(await requireUser(smUserId, 'store_manager'))) return bad('Store manager not in this company.')
      if (storeIds.length) {
        const { data: valid } = await admin.from('stores').select('id').eq('company_id', companyId).in('id', storeIds)
        if ((valid ?? []).length !== storeIds.length) return bad('One or more stores are not in this company.')
      }
      await admin.from('store_users').delete().eq('user_id', smUserId)
      if (storeIds.length) await admin.from('store_users').insert(storeIds.map(store_id => ({ user_id: smUserId, store_id })))
      await logAudit(admin, { actorId: user.id, companyId, action: 'admin.set_sm_stores', entityType: 'user', entityId: smUserId, metadata: { count: storeIds.length } })
      return done('Stores updated.')
    }

    if (action === 'set_rm_execs') {
      const rmUserId = String(parsed.data.userId ?? '')
      const execUserIds = parsed.data.execUserIds ?? []
      if (!rmUserId || !(await requireUser(rmUserId, 'regional_manager'))) return bad('Regional manager not in this company.')
      if (execUserIds.length) {
        const { data: valid } = await admin.from('user_profiles').select('id').eq('company_id', companyId).eq('role', 'executive').in('id', execUserIds)
        if ((valid ?? []).length !== execUserIds.length) return bad('One or more executives are not in this company.')
      }
      await admin.from('rm_executive_links').delete().eq('rm_user_id', rmUserId)
      if (execUserIds.length) await admin.from('rm_executive_links').insert(execUserIds.map(executive_user_id => ({ rm_user_id: rmUserId, executive_user_id, company_id: companyId })))
      await logAudit(admin, { actorId: user.id, companyId, action: 'admin.set_rm_execs', entityType: 'user', entityId: rmUserId, metadata: { count: execUserIds.length } })
      return done('Executive assignment updated.')
    }

    return bad('Unknown action')
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 400 })
  }
}
