import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { serverError } from '@/lib/api-error'
import { parseJsonBody } from '@/lib/validate'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'

const BodySchema = z.object({
  storeId: z.string().optional(),
  regionalManagerId: z.string().optional().nullable(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`assign-rm:${user.id}`, 30, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { data: profile } = await supabase.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  if (profile?.role !== 'supplier' || !profile.company_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  const { storeId, regionalManagerId } = body
  if (!storeId) return NextResponse.json({ error: 'Missing store' }, { status: 400 })

  const adminClient = createAdminClient()

  // v3: a store no longer carries a direct `regional_manager_id`. Stores link to
  // an RM THROUGH their region (regional_users: user_id ↔ region_id). So resolve
  // the store's region first, then map the RM onto that region. NOTE: because the
  // link is region-scoped, assigning/removing here applies to the whole region
  // that this store belongs to, not just this single store.
  const { data: store } = await adminClient
    .from('stores').select('id, region_id, company_id').eq('id', storeId).single()
  // Tenant guard — the store must belong to the caller's company (admin client
  // bypasses RLS, so this check is the only thing stopping cross-company writes).
  if (!store || store.company_id !== profile.company_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!store.region_id) return NextResponse.json({ error: 'Store has no region' }, { status: 400 })

  if (regionalManagerId) {
    // The RM being assigned must also be in the caller's company.
    const { data: rm } = await adminClient
      .from('user_profiles').select('id, company_id, role').eq('id', regionalManagerId).single()
    if (!rm || rm.company_id !== profile.company_id || rm.role !== 'regional_manager') {
      return NextResponse.json({ error: 'Invalid regional manager' }, { status: 400 })
    }
    const { error } = await adminClient
      .from('regional_users')
      .upsert({ user_id: regionalManagerId, region_id: store.region_id })
    if (error) return serverError(error)
    await logAudit(adminClient, { actorId: user.id, companyId: profile.company_id, action: 'supplier.assign_rm', entityType: 'user', entityId: regionalManagerId, metadata: { storeId: store.id, regionId: store.region_id } })
  } else {
    // Clearing the assignment → drop the RM link(s) for this store's region.
    const { error } = await adminClient
      .from('regional_users')
      .delete()
      .eq('region_id', store.region_id)
    if (error) return serverError(error)
    await logAudit(adminClient, { actorId: user.id, companyId: profile.company_id, action: 'supplier.unassign_rm', entityType: 'region', entityId: store.region_id, metadata: { storeId: store.id } })
  }

  return NextResponse.json({ success: true })
}
