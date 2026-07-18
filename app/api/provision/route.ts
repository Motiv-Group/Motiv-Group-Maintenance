import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { inviteUser } from '@/lib/invite'
import { logAudit } from '@/lib/audit'
import { normalisePhone, isValidEmail, isValidPhone, generatePassword } from '@/lib/csv'
import { sendEmail } from '@/lib/email'
import { buildEmail } from '@/lib/emails/server'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'
import type { Database } from '@/lib/database.types'

const BodySchema = z.object({
  action: z.string().optional(),
  name: z.string().optional(),
  code: z.string().optional(),
  regionId: z.string().optional(),
  email: z.any().optional(),
  userId: z.string().optional(),
  storeId: z.string().optional(),
  branch_code: z.string().optional(),
  store_name: z.string().optional(),
  sub_store: z.string().optional(),
  address: z.string().optional(),
  company_name: z.string().optional(),
  full_name: z.string().optional(),
  password: z.string().optional(),
  phone: z.string().optional(),
  companyName: z.string().optional(),
  trade: z.string().optional(),
  message: z.string().optional(),
})

// POST /api/provision — delegated provisioning.
//  Exec: add_region, invite_rm, add_supplier
//  RM:   add_store, invite_store_manager, add_supplier
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`provision:${user.id}`, 30, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role, company_id, full_name').eq('id', user.id).single()
  const role = me?.role, companyId = me?.company_id
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 403 })
  const isExec = role === 'executive' || role === 'system_admin'
  const isRM = role === 'regional_manager'

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
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
        await logAudit(admin, { actorId: user.id, companyId, action: 'provision.add_region', entityType: 'region', metadata: { name: body.name } })
        break
      }
      case 'invite_rm': {
        if (!isExec) return forbid()
        const { data: region } = await admin.from('regions').select('id, company_id').eq('id', body.regionId ?? '').single()
        if (!region || region.company_id !== companyId) return NextResponse.json({ error: 'Invalid region' }, { status: 400 })
        const rm = await inviteUser({ email: body.email, role: 'regional_manager', companyId, roleLabel: 'Regional Manager', baseUrl: origin, link: { regionId: body.regionId } })
        await logAudit(admin, { actorId: user.id, companyId, action: 'provision.invite_rm', entityType: 'user', entityId: rm.userId, metadata: { email: body.email, regionId: body.regionId } })
        return NextResponse.json({ ok: true, actionLink: rm.actionLink, emailed: rm.emailed })
      }
      case 'list_pending_rms': {
        if (!isExec) return forbid()
        const { data: regions } = await admin.from('regions').select('id, name, region_code').eq('company_id', companyId).eq('active', true)
        const byCode = new Map((regions ?? []).map(r => [String(r.region_code ?? '').toUpperCase(), r]))
        const { data: pend } = await admin.from('user_profiles')
          .select('id, email, full_name, requested_region_code')
          .eq('role', 'regional_manager').is('company_id', null).not('requested_region_code', 'is', null)
        const pending = (pend ?? []).map(p => {
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
        await logAudit(admin, { actorId: user.id, companyId, action: 'provision.approve_rm', entityType: 'user', entityId: body.userId, metadata: { regionId: region.id } })
        return NextResponse.json({ ok: true })
      }
      case 'reject_rm': {
        if (!isExec) return forbid()
        if (!body.userId) return NextResponse.json({ error: 'Missing user' }, { status: 400 })
        await admin.from('user_profiles').update({ requested_region_code: null }).eq('id', body.userId).is('company_id', null)
        await logAudit(admin, { actorId: user.id, companyId, action: 'provision.reject_rm', entityType: 'user', entityId: body.userId })
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
        await logAudit(admin, { actorId: user.id, companyId, action: 'provision.add_store', entityType: 'store', metadata: { branch_code: String(body.branch_code).toUpperCase(), name: body.name, regionId } })
        break
      }
      case 'invite_store_manager': {
        if (!isRM) return forbid()
        const regions = await myRegions()
        const { data: store } = await admin.from('stores').select('id, region_id, company_id').eq('id', body.storeId ?? '').single()
        if (!store || store.company_id !== companyId || !regions.includes(store.region_id ?? '')) return NextResponse.json({ error: 'Store not in your region' }, { status: 400 })
        const sm = await inviteUser({ email: body.email, role: 'store_manager', companyId, roleLabel: 'Store Manager', baseUrl: origin, link: { storeId: body.storeId } })
        await logAudit(admin, { actorId: user.id, companyId, action: 'provision.invite_store_manager', entityType: 'user', entityId: sm.userId, metadata: { email: body.email, storeId: body.storeId } })
        return NextResponse.json({ ok: true, actionLink: sm.actionLink, emailed: sm.emailed })
      }
      case 'create_store_manager': {
        if (!isRM) return forbid()
        const { full_name, email, password, branch_code, store_name } = body
        if (!full_name || !email || !password || !branch_code || !store_name)
          return NextResponse.json({ error: 'Manager name, email, password, branch code and store name are all required' }, { status: 400 })
        if (String(password).length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
        if (!isValidEmail(email)) return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
        if (!isValidPhone(body.phone)) return NextResponse.json({ error: 'Please enter a valid phone number' }, { status: 400 })
        const regions = await myRegions()
        const regionId = body.regionId && regions.includes(body.regionId) ? body.regionId : regions[0]
        if (!regionId) return NextResponse.json({ error: 'You have no region' }, { status: 400 })
        const { data: region } = await admin.from('regions').select('region_code').eq('id', regionId).single()
        const bcode = String(branch_code).toUpperCase()
        const cleanEmail = String(email).trim().toLowerCase()
        const subStore = body.sub_store || store_name
        const address = typeof body.address === 'string' ? body.address.trim() || null : null
        const companyName = typeof body.company_name === 'string' ? body.company_name.trim() || null : null

        // 1) create the store
        const { data: store, error: storeErr } = await admin.from('stores')
          .insert({ company_id: companyId, region_id: regionId, region_code: region?.region_code, branch_code: bcode, name: store_name, sub_store: subStore, address })
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
        await admin.from('user_profiles').upsert({ id: uid, role: 'store_manager', company_id: companyId, full_name, phone: phoneE164, sub_store: subStore, branch_code: bcode, address, company_name: companyName }, { onConflict: 'id' })
        await admin.from('store_users').upsert({ user_id: uid, store_id: store.id })

        // 4) email the credentials
        const { data: company } = await admin.from('companies').select('name').eq('id', companyId).single()
        const { subject, html, text } = await buildEmail('store_welcome', {
          name: full_name, loginUrl: `${origin.replace(/\/$/, '')}/auth/login`, email: cleanEmail, password,
          inviter: me?.full_name ?? null, company: company?.name ?? store_name, store: subStore,
        })
        const emailed = await sendEmail({ to: cleanEmail, subject, html, text })
        await logAudit(admin, { actorId: user.id, companyId, action: 'provision.create_store_manager', entityType: 'user', entityId: uid, metadata: { email: cleanEmail, storeId: store.id, branch_code: bcode } })
        revalidatePath('/regional/stores')
        return NextResponse.json({ ok: true, emailed, message: emailed ? 'Store manager created — login details emailed.' : `Created. Email not sent — share these: ${cleanEmail} / ${password}` })
      }
      case 'add_supplier': {
        if (!isExec && !isRM) return forbid()
        if (!body.companyName) return NextResponse.json({ error: 'Supplier name required' }, { status: 400 })
        const supEmail = body.email ? String(body.email).trim().toLowerCase() : null
        if (supEmail && !isValidEmail(supEmail)) return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
        const { data: sup, error } = await admin.from('suppliers').insert({ company_id: companyId, company_name: body.companyName, trade: body.trade ?? null, email: supEmail }).select('id').single()
        if (error || !sup) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 400 })
        await logAudit(admin, { actorId: user.id, companyId, action: 'provision.add_supplier', entityType: 'supplier', entityId: sup.id, metadata: { companyName: body.companyName, email: supEmail } })
        if (supEmail) {
          // If the email already has a Motiv login, they don't need an onboarding
          // link — send a notice that they've been added as a supplier instead.
          const { data: existing } = await admin.from('user_profiles').select('id').ilike('email', supEmail).maybeSingle()
          if (existing) {
            const { subject, html, text } = await buildEmail('supplier_added', { company: body.companyName, inviter: me?.full_name ?? null, loginUrl: `${origin.replace(/\/$/, '')}/auth/login` })
            const emailed = await sendEmail({ to: supEmail, subject, html, text })
            revalidatePath('/executive/suppliers'); revalidatePath('/regional/suppliers')
            return NextResponse.json({ ok: true, emailed, message: emailed ? 'Supplier added — they already have an account, so we let them know.' : 'Supplier added. They already have an account.' })
          }
          // Custom reusable invite token (no Supabase OTP). Valid until onboarding completes.
          const token = randomBytes(24).toString('hex')
          const { error: invErr } = await admin.from('supplier_invites').insert({ company_id: companyId, supplier_id: sup.id, email: supEmail, token })
          if (invErr) {
            await admin.from('suppliers').delete().eq('id', sup.id) // roll back the orphan supplier
            return NextResponse.json({ error: invErr.message }, { status: 400 })
          }
          const link = `${origin.replace(/\/$/, '')}/auth/supplier-onboard?token=${token}`
          const { data: myCompany } = await admin.from('companies').select('name').eq('id', companyId).single()
          const { subject, html, text } = await buildEmail('supplier_invite', { link, base: origin.replace(/\/$/, ''), inviterCompany: myCompany?.name ?? null })
          const emailed = await sendEmail({ to: supEmail, subject, html, text })
          revalidatePath('/executive/suppliers'); revalidatePath('/regional/suppliers')
          return NextResponse.json({ ok: true, emailed, actionLink: emailed ? undefined : link, message: emailed ? 'Supplier added — invite link emailed.' : 'Supplier added. Email not sent — copy this link:' })
        }
        break
      }
      case 'invite_supplier': {
        // Invite a supplier by email + optional personal message (the RM Suppliers
        // "Invite" pop-up). Creates a placeholder supplier row (name filled in by
        // the supplier at onboarding) + a reusable invite token, then emails the
        // branded invite carrying the RM's message.
        if (!isExec && !isRM) return forbid()
        const supEmail = body.email ? String(body.email).trim().toLowerCase() : ''
        if (!supEmail || !isValidEmail(supEmail)) return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
        const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) || null : null
        const supName = typeof body.companyName === 'string' && body.companyName.trim()
          ? body.companyName.trim()
          : supplierPlaceholderName(supEmail)
        const { data: myCompany } = await admin.from('companies').select('name').eq('id', companyId).single()

        // Already has a Motiv login → they don't need an onboarding link. Add the
        // supplier row and send the "you've been added" notice instead.
        const { data: existing } = await admin.from('user_profiles').select('id').ilike('email', supEmail).maybeSingle()
        if (existing) {
          const { data: sup, error } = await admin.from('suppliers').insert({ company_id: companyId, company_name: supName, email: supEmail }).select('id').single()
          if (error || !sup) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 400 })
          await admin.from('company_suppliers').upsert({ company_id: companyId, supplier_id: sup.id, source: 'admin_invite', invited_by: user.id }, { onConflict: 'company_id,supplier_id', ignoreDuplicates: true })
          await logAudit(admin, { actorId: user.id, companyId, action: 'provision.invite_supplier', entityType: 'supplier', entityId: sup.id, metadata: { email: supEmail, existing: true } })
          const { subject, html, text } = await buildEmail('supplier_added', { company: myCompany?.name ?? supName, inviter: me?.full_name ?? null, loginUrl: `${origin.replace(/\/$/, '')}/auth/login` })
          const emailed = await sendEmail({ to: supEmail, subject, html, text })
          revalidatePath('/executive/suppliers'); revalidatePath('/regional/suppliers')
          return NextResponse.json({ ok: true, emailed, message: emailed ? 'They already have a Motiv account — we let them know they were added.' : 'Supplier added. They already have an account.' })
        }

        const { data: sup, error } = await admin.from('suppliers').insert({ company_id: companyId, company_name: supName, email: supEmail }).select('id').single()
        if (error || !sup) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 400 })
        const token = randomBytes(24).toString('hex')
        const { error: invErr } = await admin.from('supplier_invites').insert({ company_id: companyId, supplier_id: sup.id, email: supEmail, token })
        if (invErr) {
          await admin.from('suppliers').delete().eq('id', sup.id) // roll back the orphan supplier
          return NextResponse.json({ error: invErr.message }, { status: 400 })
        }
        await admin.from('company_suppliers').upsert({ company_id: companyId, supplier_id: sup.id, source: 'admin_invite', invited_by: user.id }, { onConflict: 'company_id,supplier_id', ignoreDuplicates: true })
        await logAudit(admin, { actorId: user.id, companyId, action: 'provision.invite_supplier', entityType: 'supplier', entityId: sup.id, metadata: { email: supEmail, hasMessage: !!message } })
        const link = `${origin.replace(/\/$/, '')}/auth/supplier-onboard?token=${token}`
        const { subject, html, text } = await buildEmail('supplier_invite', { link, base: origin.replace(/\/$/, ''), inviterCompany: myCompany?.name ?? null, message })
        const emailed = await sendEmail({ to: supEmail, subject, html, text })
        revalidatePath('/executive/suppliers'); revalidatePath('/regional/suppliers')
        return NextResponse.json({ ok: true, emailed, actionLink: emailed ? undefined : link, message: emailed ? 'Invite sent — the supplier will get an email to set up their account.' : 'Invite created. Email not configured — copy this link:' })
      }
      case 'store_detail': {
        if (!isRM) return forbid()
        const regions = await myRegions()
        const { data: store } = await admin.from('stores').select('id, name, sub_store, branch_code, address, region_id, company_id, active, closed_at').eq('id', body.storeId ?? '').single()
        if (!store || store.company_id !== companyId || !regions.includes(store.region_id ?? '')) return NextResponse.json({ error: 'Store not in your region' }, { status: 400 })
        const { data: links } = await admin.from('store_users').select('user_id').eq('store_id', store.id)
        const smId = (links ?? [])[0]?.user_id ?? null
        let sm: { userId: string; email: string | null; phone: string | null; fullName: string | null; companyName: string | null } | null = null
        if (smId) {
          const { data: p } = await admin.from('user_profiles').select('email, phone, full_name, company_name').eq('id', smId).single()
          sm = { userId: smId, email: p?.email ?? null, phone: p?.phone ?? null, fullName: p?.full_name ?? null, companyName: p?.company_name ?? null }
        }
        return NextResponse.json({ store: { id: store.id, name: store.name, subStore: store.sub_store, branchCode: store.branch_code, address: store.address ?? null, active: store.active, closedAt: store.closed_at }, sm })
      }
      case 'update_store': {
        if (!isRM) return forbid()
        const regions = await myRegions()
        const { data: store } = await admin.from('stores').select('id, name, sub_store, region_id, company_id').eq('id', body.storeId ?? '').single()
        if (!store || store.company_id !== companyId || !regions.includes(store.region_id ?? '')) return NextResponse.json({ error: 'Store not in your region' }, { status: 400 })

        // Store row edits (name / sub-store / branch code / address). These mirror
        // the store-manager's greyed-out "Store Information" settings fields.
        const bcode = typeof body.branch_code === 'string' && body.branch_code.trim() ? body.branch_code.trim().toUpperCase() : null
        const subStore = typeof body.sub_store === 'string' && body.sub_store.trim() ? body.sub_store.trim() : null
        const address = typeof body.address === 'string' ? body.address.trim() || null : undefined
        const patch: Database['public']['Tables']['stores']['Update'] = {}
        if (typeof body.store_name === 'string' && body.store_name.trim()) patch.name = body.store_name.trim()
        if (subStore) patch.sub_store = subStore
        if (bcode) patch.branch_code = bcode
        if (address !== undefined) patch.address = address
        if (Object.keys(patch).length) {
          const { error } = await admin.from('stores').update(patch).eq('id', store.id)
          if (error) return NextResponse.json({ error: error.message.includes('duplicate') ? 'Branch code already exists' : error.message }, { status: 400 })
        }

        // Store-manager profile edits — keep the SM's own record in sync with the
        // store (name/company/contact/branch), matching what they see in Settings.
        const { data: links } = await admin.from('store_users').select('user_id').eq('store_id', store.id)
        const smId = (links ?? [])[0]?.user_id ?? null
        const newEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : null
        const newPhoneRaw = typeof body.phone === 'string' ? body.phone : null
        let emailed: boolean | undefined
        if (smId) {
          const { data: cur } = await admin.from('user_profiles').select('email, phone, full_name').eq('id', smId).single()
          const profPatch: Database['public']['Tables']['user_profiles']['Update'] = {}

          if (typeof body.full_name === 'string' && body.full_name.trim()) profPatch.full_name = body.full_name.trim()
          if (typeof body.company_name === 'string') profPatch.company_name = body.company_name.trim() || null
          if (subStore) profPatch.sub_store = subStore
          if (bcode) profPatch.branch_code = bcode
          if (address !== undefined) profPatch.address = address

          if (newPhoneRaw != null && newPhoneRaw !== '') {
            if (!isValidPhone(newPhoneRaw)) return NextResponse.json({ error: 'Please enter a valid phone number' }, { status: 400 })
            profPatch.phone = normalisePhone(newPhoneRaw)
          }

          const emailChanged = !!newEmail && newEmail !== (cur?.email ?? '').toLowerCase()
          if (emailChanged) {
            if (!isValidEmail(newEmail)) return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
            const password = generatePassword()
            const { error: authErr } = await admin.auth.admin.updateUserById(smId, { email: newEmail, password, email_confirm: true })
            if (authErr) return NextResponse.json({ error: /already|registered|exists/i.test(authErr.message) ? 'That email already has an account' : authErr.message }, { status: 400 })
            profPatch.email = newEmail
            if (Object.keys(profPatch).length) await admin.from('user_profiles').update(profPatch).eq('id', smId)
            // Email the new credentials (invite link + username + password).
            const { data: company } = await admin.from('companies').select('name').eq('id', companyId).single()
            const { subject, html, text } = await buildEmail('store_welcome', {
              name: cur?.full_name ?? '', loginUrl: `${origin.replace(/\/$/, '')}/auth/login`, email: newEmail, password,
              inviter: me?.full_name ?? null, company: company?.name ?? (patch.name ?? store.name), store: patch.sub_store ?? store.sub_store ?? store.name,
            })
            emailed = await sendEmail({ to: newEmail, subject, html, text })
          } else if (Object.keys(profPatch).length) {
            await admin.from('user_profiles').update(profPatch).eq('id', smId)
          }
        }
        await logAudit(admin, { actorId: user.id, companyId, action: 'provision.update_store', entityType: 'store', entityId: store.id, metadata: { storeId: store.id, contactChanged: !!(newEmail || newPhoneRaw) } })
        revalidatePath('/regional/stores')
        return NextResponse.json({ ok: true, emailed, message: emailed === undefined ? 'Store updated.' : emailed ? 'Store updated — new login details emailed.' : 'Store updated. Email not sent — share the new password manually.' })
      }
      case 'deactivate_store': {
        if (!isRM) return forbid()
        const regions = await myRegions()
        const { data: store } = await admin.from('stores').select('id, region_id, company_id').eq('id', body.storeId ?? '').single()
        if (!store || store.company_id !== companyId || !regions.includes(store.region_id ?? '')) return NextResponse.json({ error: 'Store not in your region' }, { status: 400 })
        const { error } = await admin.from('stores').update({ active: false, closed_at: new Date().toISOString() }).eq('id', store.id)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        await logAudit(admin, { actorId: user.id, companyId, action: 'provision.deactivate_store', entityType: 'store', entityId: store.id })
        revalidatePath('/regional/stores')
        return NextResponse.json({ ok: true, message: 'Store deactivated.' })
      }
      case 'reactivate_store': {
        if (!isRM) return forbid()
        const regions = await myRegions()
        const { data: store } = await admin.from('stores').select('id, region_id, company_id').eq('id', body.storeId ?? '').single()
        if (!store || store.company_id !== companyId || !regions.includes(store.region_id ?? '')) return NextResponse.json({ error: 'Store not in your region' }, { status: 400 })
        const { error } = await admin.from('stores').update({ active: true, closed_at: null }).eq('id', store.id)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        await logAudit(admin, { actorId: user.id, companyId, action: 'provision.reactivate_store', entityType: 'store', entityId: store.id })
        revalidatePath('/regional/stores')
        return NextResponse.json({ ok: true, message: 'Store reactivated.' })
      }
      case 'delete_store': {
        if (!isRM) return forbid()
        const regions = await myRegions()
        const { data: store } = await admin.from('stores').select('id, region_id, company_id').eq('id', body.storeId ?? '').single()
        if (!store || store.company_id !== companyId || !regions.includes(store.region_id ?? '')) return NextResponse.json({ error: 'Store not in your region' }, { status: 400 })
        // Block hard-delete when the store has ticket history.
        const { count } = await admin.from('tickets').select('id', { count: 'exact', head: true }).eq('store_id', store.id)
        if ((count ?? 0) > 0) return NextResponse.json({ error: 'This store has tickets — deactivate it instead of deleting.' }, { status: 400 })
        // Remove the store-manager account(s) tied only to this store, then the store.
        const { data: links } = await admin.from('store_users').select('user_id').eq('store_id', store.id)
        for (const l of (links ?? [])) {
          const { data: others } = await admin.from('store_users').select('store_id').eq('user_id', l.user_id).neq('store_id', store.id)
          if (!others || others.length === 0) {
            await admin.from('store_users').delete().eq('user_id', l.user_id)
            await admin.from('user_profiles').delete().eq('id', l.user_id)
            await admin.auth.admin.deleteUser(l.user_id).catch(() => {})
          } else {
            await admin.from('store_users').delete().eq('user_id', l.user_id).eq('store_id', store.id)
          }
        }
        const { error } = await admin.from('stores').delete().eq('id', store.id)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        await logAudit(admin, { actorId: user.id, companyId, action: 'provision.delete_store', entityType: 'store', entityId: store.id, metadata: { removedManagers: (links ?? []).length } })
        revalidatePath('/regional/stores')
        return NextResponse.json({ ok: true, message: 'Store deleted.' })
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 400 })
  }

  revalidatePath('/executive/regions'); revalidatePath('/regional/stores'); revalidatePath('/executive/suppliers'); revalidatePath('/regional/suppliers')
  return NextResponse.json({ ok: true })
}

function forbid() { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

/** Best-effort company name for an email-only invite: use the domain (e.g.
 *  flowfix.co.za → "Flowfix") unless it's a free-mail provider, else a neutral
 *  placeholder. The supplier confirms/edits their real name at onboarding. */
function supplierPlaceholderName(email: string): string {
  const domain = (email.split('@')[1] ?? '').toLowerCase()
  const free = /^(gmail|outlook|hotmail|yahoo|live|icloud|proton(mail)?|ymail|aol|mail|webmail|mweb|telkomsa|vodamail|gmx|zoho)\./
  if (domain && !free.test(domain)) {
    const core = domain.split('.')[0]
    if (core) return core.charAt(0).toUpperCase() + core.slice(1)
  }
  return 'Invited supplier'
}
