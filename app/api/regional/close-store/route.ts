import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'

// PATCH /api/regional/close-store — close (archive) or reopen a managed store.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!rateLimit(`close-store:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many requests — try again shortly.' }, { status: 429 })
  }

  const { storeId, action, reason } = await request.json()
  if (!storeId || !['close', 'reopen'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (action === 'close' && !reason?.trim()) {
    return NextResponse.json({ error: 'A reason for closure is required.' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // The store must be one this RM manages.
  const { data: store } = await adminClient
    .from('profiles')
    .select('id, regional_manager_id, company_name, sub_store')
    .eq('id', storeId)
    .in('role', ['store_manager', 'client'])
    .single()

  if (!store || store.regional_manager_id !== user.id) {
    return NextResponse.json({ error: 'Store not found in your region.' }, { status: 404 })
  }

  const update = action === 'close'
    ? { closed_at: new Date().toISOString(), closure_reason: reason.trim() }
    : { closed_at: null, closure_reason: null }

  const { error } = await adminClient.from('profiles').update(update).eq('id', storeId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    store: { company_name: store.company_name, sub_store: store.sub_store },
  })
}
