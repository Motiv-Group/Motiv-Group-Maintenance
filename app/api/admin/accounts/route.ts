import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { inviteUser } from '@/lib/invite'
import { normalisePhone, isValidEmail, isValidPhone } from '@/lib/csv'

// POST /api/admin/accounts — system-admin provisions the SM/RM/Executive hierarchy.
//  create_executive: new company + Executive (top of the tree)
//  invite_rm:        Regional Manager linked to a company region (created if new)
//  invite_sm:        Store Manager + their store, in a company region
// Each sends an email set-password (activation) link via inviteUser.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`admin-accounts:${user.id}`, 30, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'system_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const action = String(body.action ?? '')
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const bad = (error: string) => NextResponse.json({ error }, { status: 400 })
  const done = (extra: Record<string, unknown>) => { revalidatePath('/admin/accounts'); return NextResponse.json({ ok: true, ...extra }) }
  const contactError = (email: unknown, phone: unknown): string | null => {
    if (!isValidEmail(String(email ?? ''))) return 'Enter a valid email address'
    if (phone && !isValidPhone(String(phone))) return 'Enter a valid phone number'
    return null
  }
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

  try {
    if (action === 'create_executive') {
      const companyName = str(body.companyName), fullName = str(body.full_name)
      if (!companyName || !fullName || !body.email) return bad('Company name, full name and email are required.')
      const ce = contactError(body.email, body.phone); if (ce) return bad(ce)
      const { data: company, error: cErr } = await admin.from('companies').insert({ name: companyName }).select('id').single()
      if (cErr || !company) return bad(cErr?.message ?? 'Could not create company.')
      try {
        const inv = await inviteUser({ email: body.email, role: 'executive', companyId: company.id, roleLabel: 'Executive', baseUrl: origin, link: {}, profile: { fullName, phone: normalisePhone(body.phone), address: str(body.address) } })
        return done({ actionLink: inv.actionLink, emailed: inv.emailed, message: inv.emailed ? 'Executive created — activation link emailed.' : 'Executive created. Email not sent — copy the activation link below.' })
      } catch (e: any) { await admin.from('companies').delete().eq('id', company.id); return bad(e?.message ?? 'Invite failed.') }
    }

    if (action === 'invite_rm') {
      const companyId = str(body.companyId), fullName = str(body.full_name)
      if (!companyId || !fullName || !body.email) return bad('Company, full name and email are required.')
      const ce = contactError(body.email, body.phone); if (ce) return bad(ce)
      let regionId = str(body.regionId)
      if (!regionId && str(body.newRegionName)) {
        const code = String(body.newRegionCode || body.newRegionName).toUpperCase().replace(/\s+/g, '').slice(0, 12)
        const { data: r, error } = await admin.from('regions').insert({ company_id: companyId, name: str(body.newRegionName), region_code: code }).select('id').single()
        if (error || !r) return bad(error?.message ?? 'Could not create region.')
        regionId = r.id
      }
      if (!regionId) return bad('Choose an existing region or create a new one.')
      const { data: region } = await admin.from('regions').select('id, company_id').eq('id', regionId).single()
      if (!region || region.company_id !== companyId) return bad('That region is not in the selected company.')
      const inv = await inviteUser({ email: body.email, role: 'regional_manager', companyId, roleLabel: 'Regional Manager', baseUrl: origin, link: { regionId }, profile: { fullName, phone: normalisePhone(body.phone), address: str(body.address) } })
      return done({ actionLink: inv.actionLink, emailed: inv.emailed, message: inv.emailed ? 'Regional Manager invited — activation link emailed.' : 'Created. Email not sent — copy the activation link below.' })
    }

    if (action === 'invite_sm') {
      const companyId = str(body.companyId), regionId = str(body.regionId)
      const storeName = str(body.storeName), branchCode = str(body.branchCode), fullName = str(body.full_name)
      if (!companyId || !regionId || !storeName || !branchCode || !fullName || !body.email) return bad('Company, region, store name, branch code, full name and email are required.')
      const ce = contactError(body.email, body.phone); if (ce) return bad(ce)
      const { data: region } = await admin.from('regions').select('id, company_id, region_code').eq('id', regionId).single()
      if (!region || region.company_id !== companyId) return bad('That region is not in the selected company.')
      const bcode = branchCode.toUpperCase()
      const subStore = str(body.subStore) || storeName
      const { data: store, error: sErr } = await admin.from('stores')
        .insert({ company_id: companyId, region_id: regionId, region_code: region.region_code, branch_code: bcode, name: storeName, sub_store: subStore })
        .select('id').single()
      if (sErr || !store) return bad(/duplicate/i.test(sErr?.message ?? '') ? 'That branch code already exists.' : (sErr?.message ?? 'Could not create store.'))
      try {
        const inv = await inviteUser({ email: body.email, role: 'store_manager', companyId, roleLabel: 'Store Manager', baseUrl: origin, link: { storeId: store.id }, profile: { fullName, phone: normalisePhone(body.phone), address: str(body.address), subStore, branchCode: bcode } })
        return done({ actionLink: inv.actionLink, emailed: inv.emailed, message: inv.emailed ? 'Store Manager invited — activation link emailed.' : 'Created. Email not sent — copy the activation link below.' })
      } catch (e: any) { await admin.from('stores').delete().eq('id', store.id); return bad(e?.message ?? 'Invite failed.') }
    }

    return bad('Unknown action')
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed' }, { status: 400 })
  }
}
