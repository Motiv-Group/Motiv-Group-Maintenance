import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'regional_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { branch_code } = await request.json()
  if (!branch_code?.trim()) {
    return NextResponse.json({ error: 'Branch code is required' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const normalised = branch_code.trim().toUpperCase()

  // Try exact match first (stored values are uppercased), then fall back to
  // case-insensitive search in case of legacy data saved without normalisation.
  const { data: stores, error: queryError } = await adminClient
    .from('profiles')
    .select('id, company_name, sub_store, regional_manager_id, branch_code')
    .or(`branch_code.eq.${normalised},branch_code.ilike.${normalised}`)
    .in('role', ['store_manager', 'client'])

  if (queryError) {
    if (queryError.message?.includes('branch_code') || queryError.code === '42703') {
      return NextResponse.json({
        error: 'The branch_code column does not exist yet. Please run the migration SQL in your Supabase SQL Editor first.',
      }, { status: 500 })
    }
    return NextResponse.json({ error: queryError.message }, { status: 500 })
  }

  if (!stores || stores.length === 0) {
    // Diagnostic: count how many stores have any branch_code set at all
    const { data: allStores } = await adminClient
      .from('profiles')
      .select('branch_code')
      .in('role', ['store_manager', 'client'])
      .not('branch_code', 'is', null)

    const storedCodes = (allStores ?? []).map((s: any) => s.branch_code).filter(Boolean)

    const hint = storedCodes.length === 0
      ? ' No stores have set a branch code yet — ask the store manager to set one in their Settings page.'
      : ` Branch codes on file: ${storedCodes.join(', ')}.`

    return NextResponse.json({
      error: `No store found with branch code "${normalised}".${hint}`,
    }, { status: 404 })
  }

  const store = stores[0]

  if (store.regional_manager_id && store.regional_manager_id !== user.id) {
    return NextResponse.json({
      error: 'This store is already assigned to another regional manager.',
    }, { status: 409 })
  }

  if (store.regional_manager_id === user.id) {
    return NextResponse.json({ error: 'This store is already in your region.' }, { status: 409 })
  }

  const { error: updateError } = await adminClient
    .from('profiles')
    .update({ regional_manager_id: user.id })
    .eq('id', store.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    store: { company_name: store.company_name, sub_store: store.sub_store },
  })
}
