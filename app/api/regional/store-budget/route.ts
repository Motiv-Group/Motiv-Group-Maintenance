import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'

// PATCH /api/regional/store-budget — set a store's monthly Capex budget.
// Regional managers only, and only for stores they own.
export async function PATCH(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  if (!rateLimit(`budget:${user.id}`, 30, 60_000))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { storeId, capex_budget } = await request.json()
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
  // Verify the RM owns this store before writing.
  const { data: store } = await admin
    .from('profiles').select('id')
    .eq('id', storeId).eq('regional_manager_id', user.id)
    .in('role', ['store_manager', 'client']).single()
  if (!store) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await admin.from('profiles').update({ capex_budget: value }).eq('id', storeId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath(`/regional/stores/${storeId}`)
  revalidatePath(`/regional/stores/${storeId}/budget`)
  return NextResponse.json({ success: true })
}
