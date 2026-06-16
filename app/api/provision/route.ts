import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { inviteUser } from '@/lib/invite'

// POST /api/provision — delegated provisioning.
//  Exec: add_region, invite_rm, add_supplier
//  RM:   add_store, invite_store_manager, add_supplier
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!rateLimit(`provision:${user.id}`, 30, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  const role = me?.role, companyId = me?.company_id
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 403 })
  const isExec = role === 'executive' || role === 'system_admin'
  const isRM = role === 'regional_manager'

  const body = await request.json()
  const { action } = body
  const myRegions = async () => ((await admin.from('regional_users').select('region_id').eq('user_id', user.id)).data ?? []).map(r => r.region_id)

  try {
    switch (action) {
      case 'add_region': {
        if (!isExec) return forbid()
        if (!body.name) return NextResponse.json({ error: 'Region name required' }, { status: 400 })
        const { error } = await admin.from('regions').insert({ company_id: companyId, name: body.name, region_code: (body.code ?? body.name).toString().toUpperCase().slice(0, 12) })
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        break
      }
      case 'invite_rm': {
        if (!isExec) return forbid()
        const { data: region } = await admin.from('regions').select('id, company_id').eq('id', body.regionId).single()
        if (!region || region.company_id !== companyId) return NextResponse.json({ error: 'Invalid region' }, { status: 400 })
        const rm = await inviteUser({ email: body.email, role: 'regional_manager', companyId, roleLabel: 'Regional Manager', link: { regionId: body.regionId } })
        return NextResponse.json({ ok: true, actionLink: rm.actionLink, emailed: rm.emailed })
      }
      case 'add_store': {
        if (!isRM) return forbid()
        const regions = await myRegions()
        const regionId = body.regionId && regions.includes(body.regionId) ? body.regionId : regions[0]
        if (!regionId) return NextResponse.json({ error: 'You have no region' }, { status: 400 })
        const { data: region } = await admin.from('regions').select('region_code').eq('id', regionId).single()
        if (!body.branch_code || !body.name) return NextResponse.json({ error: 'Branch code and name required' }, { status: 400 })
        const { error } = await admin.from('stores').insert({ company_id: companyId, region_id: regionId, region_code: region?.region_code, branch_code: String(body.branch_code).toUpperCase(), name: body.name })
        if (error) return NextResponse.json({ error: error.message.includes('duplicate') ? 'Branch code already exists' : error.message }, { status: 400 })
        break
      }
      case 'invite_store_manager': {
        if (!isRM) return forbid()
        const regions = await myRegions()
        const { data: store } = await admin.from('stores').select('id, region_id, company_id').eq('id', body.storeId).single()
        if (!store || store.company_id !== companyId || !regions.includes(store.region_id)) return NextResponse.json({ error: 'Store not in your region' }, { status: 400 })
        const sm = await inviteUser({ email: body.email, role: 'store_manager', companyId, roleLabel: 'Store Manager', link: { storeId: body.storeId } })
        return NextResponse.json({ ok: true, actionLink: sm.actionLink, emailed: sm.emailed })
      }
      case 'add_supplier': {
        if (!isExec && !isRM) return forbid()
        if (!body.companyName) return NextResponse.json({ error: 'Supplier name required' }, { status: 400 })
        const { data: sup, error } = await admin.from('suppliers').insert({ company_id: companyId, company_name: body.companyName, trade: body.trade ?? null }).select('id').single()
        if (error || !sup) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 400 })
        if (body.email) {
          const inv = await inviteUser({ email: body.email, role: 'supplier', companyId, roleLabel: 'Supplier', link: { supplierId: sup.id } })
          return NextResponse.json({ ok: true, actionLink: inv.actionLink, emailed: inv.emailed })
        }
        break
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed' }, { status: 400 })
  }

  revalidatePath('/executive/regions'); revalidatePath('/regional/stores'); revalidatePath('/executive/suppliers'); revalidatePath('/regional/suppliers')
  return NextResponse.json({ ok: true })
}

function forbid() { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
