import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { serverError } from '@/lib/api-error'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'

const BodySchema = z.object({
  storeId: z.string(),
  capex_budget: z.any().optional().nullable(),
})

// PATCH /api/regional/store-budget — set a store's monthly Capex budget.
// Regional managers only, and only for stores they own.
export async function PATCH(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  if (!(await rateLimit(`budget:${user.id}`, 30, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  const { storeId, capex_budget } = body
  if (!storeId) return NextResponse.json({ error: 'Missing store' }, { status: 400 })

  // null/empty clears the budget; otherwise must be a non-negative number
  let value: number | null = null
  if (capex_budget !== null && capex_budget !== '' && capex_budget !== undefined) {
    const n = Number(capex_budget)
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'Budget must be a positive number' }, { status: 400 })
    }
    value = Math.round(n * 100) / 100
  }

  const admin = createAdminClient()
  // v3: capex_budget lives on the `stores` table, and RM ownership is via region
  // (regional_users). Verify the store's region is one this RM manages before writing.
  const { data: regions } = await admin
    .from('regional_users').select('region_id').eq('user_id', user.id)
  const regionIds = (regions ?? []).map(r => r.region_id)
  if (!regionIds.length) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: store } = await admin
    .from('stores').select('id, region_id')
    .eq('id', storeId).single()
  if (!store || !store.region_id || !regionIds.includes(store.region_id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await admin.from('stores').update({ capex_budget: value }).eq('id', storeId)
  if (error) return serverError(error)

  revalidatePath(`/regional/stores/${storeId}`)
  revalidatePath(`/regional/stores/${storeId}/budget`)
  return NextResponse.json({ success: true })
}
