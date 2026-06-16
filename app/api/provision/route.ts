import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { inviteUser } from '@/lib/invite'
import { normalisePhone } from '@/lib/csv'
import { sendEmail, storeInviteEmail } from '@/lib/email'

// POST /api/provision — delegated provisioning.
//  Exec: add_region, invite_rm, add_supplier
//  RM:   add_store, invite_store_manager, add_supplier
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!rateLimit(`provision:${user.id}`, 30, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role, company_id, full_name').eq('id', user.id).single()
  const role = me?.role, companyId = me?.company_id
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 403 })
  const isExec = role === 'executive' || role === 'system_admin'
  const isRM = role === 'regional_manager'

  const body = await request.json()
  const { action } = body
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
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
        const rm = await inviteUser({ email: body.email, role: 'regional_manager', companyId, roleLabel: 'Regional Manager', baseUrl: origin, link: { regionId: body.regionId } })
        return NextResponse.json({ ok: true, actionLink: rm.actionLink, emailed: rm.emailed })
      }
      case 'list_pending_rms': {
        if (!isExec) return forbid()
        const { data: regions } = await admin.from('regions').select('id, name, region_code').eq('company_id', companyId).eq('active', true)
        const byCode = new Map((regions ?? []).map((r: any) => [String(r.region_code ?? '').toUpperCase(), r]))
        const { data: pend } = await admin.from('user_profiles')
          .select('id, email, full_name, requested_region_code')
          .eq('role', 'regional_manager').is('company_id', null).not('requested_region_code', 'is', null)
        const pending = (pend ?? []).map((p: any) => {
          const region = byCode.get(String(p.requested_region_code ?? '').toUpperCase())
          return { id: p.id, email: p.email, fullName: p.full_name, code: p.requested_region_code, regionId: region?.id ?? null, regionName: region?.name ?? null }
        }).filter(p => p.regionId) // only RMs whose code matches one of this exec's regions
        return NextResponse.json({ pending })
      }
      case 'approve_rm': {
        if (!isExec) return forbid()
        if (!body.userId) return NextResponse.json({ error: 'Missing user' }, { status: 400 })
        const { data: rmProfile } = await admin.from('user_profiles').select('id, requested_region_code, company_id').eq('id', body.userId).eq('role', 'regional_manager').single()
        if (!rmProfile || rmProfile.company_id) return NextResponse.json({ error: 'Not a pending RM' }, { status: 400 })
        const code = String(rmProfile.requested_region_code ?? '').toUpperCase()
        const { data: region } = await admin.from('regions').select('id').eq('company_id', companyId).eq('active', true).ilike('region_code', code).maybeSingle()
        if (!region) return NextResponse.json({ error: 'Region code does not match any of your regions' }, { status: 400 })
        const { error: upErr } = await admin.from('user_profiles').update({ company_id: companyId, requested_region_code: null }).eq('id', body.userId)
        if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })
        await admin.from('regional_users').upsert({ user_id: body.userId, region_id: region.id })
        return NextResponse.json({ ok: true })
      }
      case 'reject_rm': {
        if (!isExec) return forbid()
        if (!body.userId) return NextResponse.json({ error: 'Missing user' }, { status: 400 })
        await admin.from('user_profiles').update({ requested_region_code: null }).eq('id', body.userId).is('company_id', null)
        return NextResponse.json({ ok: true })
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
        const sm = await inviteUser({ email: body.email, role: 'store_manager', companyId, roleLabel: 'Store Manager', baseUrl: origin, link: { storeId: body.storeId } })
        return NextResponse.json({ ok: true, actionLink: sm.actionLink, emailed: sm.emailed })
      }
      case 'create_store_manager': {
        if (!isRM) return forbid()
        const { full_name, email, password, branch_code, store_name } = body
        if (!full_name || !email || !password || !branch_code || !store_name)
          return NextResponse.json({ error: 'Manager name, email, password, branch code and store name are all required' }, { status: 400 })
        if (String(password).length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
        const regions = await myRegions()
        const regionId = body.regionId && regions.includes(body.regionId) ? body.regionId : regions[0]
        if (!regionId) return NextResponse.json({ error: 'You have no region' }, { status: 400 })
        const { data: region } = await admin.from('regions').select('region_code').eq('id', regionId).single()
        const bcode = String(branch_code).toUpperCase()
        const cleanEmail = String(email).trim().toLowerCase()
        const subStore = body.sub_store || store_name

        // 1) create the store
        const { data: store, error: storeErr } = await admin.from('stores')
          .insert({ company_id: companyId, region_id: regionId, region_code: region?.region_code, branch_code: bcode, name: store_name, sub_store: subStore })
          .select('id').single()
        if (storeErr || !store) return NextResponse.json({ error: storeErr?.message?.includes('duplicate') ? 'Branch code already exists' : (storeErr?.message ?? 'Could not create store') }, { status: 400 })

        // 2) create the login-ready auth user
        const phoneE164 = normalisePhone(body.phone)
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: cleanEmail, password, email_confirm: true,
          user_metadata: { full_name, phone: phoneE164, company_id: companyId, role: 'store_manager', sub_store: subStore, branch_code: bcode },
        })
        if (createErr || !created?.user) {
          await admin.from('stores').delete().eq('id', store.id) // roll back the store
          const msg = createErr?.message ?? 'Could not create account'
          return NextResponse.json({ error: /already|registered|exists/i.test(msg) ? 'That email already has an account' : msg }, { status: 400 })
        }
        const uid = created.user.id

        // 3) enforce profile + link to the store
        await admin.from('user_profiles').upsert({ id: uid, role: 'store_manager', company_id: companyId, full_name, phone: phoneE164, sub_store: subStore, branch_code: bcode }, { onConflict: 'id' })
        await admin.from('store_users').upsert({ user_id: uid, store_id: store.id })

        // 4) email the credentials
        const { data: company } = await admin.from('companies').select('name').eq('id', companyId).single()
        const { subject, html, text } = storeInviteEmail({
          managerName: full_name, loginUrl: `${origin.replace(/\/$/, '')}/auth/login`, email: cleanEmail, password,
          rmName: me?.full_name ?? null, company: company?.name ?? store_name, subStore,
        })
        const emailed = await sendEmail({ to: cleanEmail, subject, html, text })
        revalidatePath('/regional/stores')
        return NextResponse.json({ ok: true, emailed, message: emailed ? 'Store manager created — login details emailed.' : `Created. Email not sent — share these: ${cleanEmail} / ${password}` })
      }
      case 'add_supplier': {
        if (!isExec && !isRM) return forbid()
        if (!body.companyName) return NextResponse.json({ error: 'Supplier name required' }, { status: 400 })
        const { data: sup, error } = await admin.from('suppliers').insert({ company_id: companyId, company_name: body.companyName, trade: body.trade ?? null }).select('id').single()
        if (error || !sup) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 400 })
        if (body.email) {
          try {
            const inv = await inviteUser({ email: body.email, role: 'supplier', companyId, roleLabel: 'Supplier', baseUrl: origin, link: { supplierId: sup.id } })
            return NextResponse.json({ ok: true, actionLink: inv.actionLink, emailed: inv.emailed })
          } catch (e: any) {
            await admin.from('suppliers').delete().eq('id', sup.id) // roll back the orphan supplier
            return NextResponse.json({ error: e?.message ?? 'Invite failed' }, { status: 400 })
          }
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
