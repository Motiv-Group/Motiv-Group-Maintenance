import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { inviteUser } from '@/lib/invite'
import { logAudit } from '@/lib/audit'
import { normalisePhone, isValidEmail, isValidPhone } from '@/lib/csv'
import { sendEmail } from '@/lib/email'
import { buildEmail } from '@/lib/emails/server'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'

type Admin = ReturnType<typeof createAdminClient>

const errMsg = (e: unknown, fallback: string): string => (e instanceof Error ? e.message : fallback)

const BodySchema = z.object({
  action: z.string().optional(),
  companyName: z.any().optional(),
  companyId: z.any().optional(),
  full_name: z.any().optional(),
  email: z.any().optional(),
  phone: z.any().optional(),
  address: z.any().optional(),
  regionId: z.any().optional(),
  newRegionName: z.any().optional(),
  newRegionCode: z.any().optional(),
  storeName: z.any().optional(),
  branchCode: z.any().optional(),
  subStore: z.any().optional(),
  storeId: z.any().optional(),
  userId: z.any().optional(),
  role: z.any().optional(),
  projectId: z.any().optional(),
  supplierName: z.any().optional(),
  rows: z.array(z.record(z.string(), z.any())).optional(),
})

// Bulk import resolves company/region by NAME (find-or-create), so a flat CSV can
// define the whole tree in one go.
async function findOrCreateCompany(admin: Admin, name: string): Promise<string | null> {
  const clean = name.trim(); if (!clean) return null
  const { data: existing } = await admin.from('companies').select('id').ilike('name', clean).maybeSingle()
  if (existing?.id) return existing.id
  const { data: c } = await admin.from('companies').insert({ name: clean }).select('id').single()
  return c?.id ?? null
}
async function findOrCreateRegion(admin: Admin, companyId: string, name: string, code: string): Promise<string | null> {
  const clean = name.trim(); if (!clean) return null
  const c = String(code || name).toUpperCase().replace(/\s+/g, '').slice(0, 12)
  const { data: existing } = await admin.from('regions').select('id').eq('company_id', companyId).or(`region_code.eq.${c},name.ilike.${clean}`).maybeSingle()
  if (existing?.id) return existing.id
  const { data: r } = await admin.from('regions').insert({ company_id: companyId, name: clean, region_code: c }).select('id').single()
  return r?.id ?? null
}

// Link an existing supplier ORG (matched by email) to a company, or create +
// invite a brand-new one. A supplier is a competing outsider shared across
// companies, so an existing supplier is REUSED (a company_suppliers link is
// added) rather than duplicated. Mirrors the exec/RM /api/provision invite flow
// (supplier_invites token + onboarding email; "already has a login" → added note).
async function linkOrInviteSupplier(
  admin: Admin,
  opts: { companyId: string; supplierName: string; email: string; phone?: string | null; address?: string; actorId: string; origin: string; inviterCompany: string | null; message?: string | null },
): Promise<{ supplierId: string; emailed: boolean; actionLink: string | null; message: string }> {
  const email = opts.email.trim().toLowerCase()
  const base = opts.origin.replace(/\/$/, '')
  const { data: existingSup } = await admin.from('suppliers').select('id, company_name').ilike('email', email).limit(1).maybeSingle()
  const name = opts.supplierName.trim() || existingSup?.company_name || email.split('@')[0]

  let supplierId: string
  if (existingSup?.id) {
    supplierId = existingSup.id
  } else {
    const { data: sup, error } = await admin.from('suppliers')
      .insert({ company_id: opts.companyId, company_name: name, email, phone: opts.phone ?? null, address: opts.address || null, source: 'invited' })
      .select('id').single()
    if (error || !sup) throw new Error(error?.message ?? 'Could not create supplier')
    supplierId = sup.id
  }

  // Persist the company<->supplier membership (idempotent).
  await admin.from('company_suppliers').upsert(
    { company_id: opts.companyId, supplier_id: supplierId, source: 'admin_invite', invited_by: opts.actorId },
    { onConflict: 'company_id,supplier_id' },
  )

  // Already has a login → no onboarding link; send the "you've been added" note.
  const { data: existingUser } = await admin.from('user_profiles').select('id').ilike('email', email).maybeSingle()
  if (existingUser) {
    const { subject, html, text } = await buildEmail('supplier_added', { company: opts.inviterCompany ?? name, inviter: null, loginUrl: `${base}/auth/login` })
    const emailed = await sendEmail({ to: email, subject, html, text })
    return { supplierId, emailed, actionLink: null, message: emailed ? 'Supplier already had an account — linked and notified.' : 'Supplier already had an account — linked.' }
  }

  // Otherwise send a set-up (onboarding) invite for this company.
  const token = randomBytes(24).toString('hex')
  const { error: invErr } = await admin.from('supplier_invites').insert({ company_id: opts.companyId, supplier_id: supplierId, email, token })
  if (invErr) throw new Error(invErr.message)
  const link = `${base}/auth/supplier-onboard?token=${token}`
  const { subject, html, text } = await buildEmail('supplier_invite', { link, base, inviterCompany: opts.inviterCompany, message: opts.message ?? null })
  const emailed = await sendEmail({ to: email, subject, html, text })
  return { supplierId, emailed, actionLink: emailed ? null : link, message: emailed ? 'Supplier invited — set-up email sent.' : 'Supplier invited. Email not sent — copy the link below.' }
}

// POST /api/admin/accounts — system-admin provisions the SM/RM/Executive hierarchy.
//  create_executive: new company + Executive (top of the tree)
//  invite_rm:        Regional Manager linked to a company region (created if new)
//  invite_sm:        Store Manager + their store, in a company region
// Each sends an email set-password (activation) link via inviteUser.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`admin-accounts:${user.id}`, 30, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'system_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
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
    // Create a company on its own — no user. Executives (and everyone else) are
    // added afterwards, and a company may have none.
    if (action === 'create_company') {
      const name = str(body.companyName)
      if (!name) return bad('Company name is required.')
      const { data: existing } = await admin.from('companies').select('id').ilike('name', name).maybeSingle()
      if (existing?.id) return bad('A company with that name already exists — pick it from the list.')
      const { data: company, error } = await admin.from('companies').insert({ name }).select('id, name').single()
      if (error || !company) return bad(error?.message ?? 'Could not create company.')
      await logAudit(admin, { actorId: user.id, companyId: company.id, action: 'admin.create_company', entityType: 'company', entityId: company.id, metadata: { name } })
      return done({ companyId: company.id, companyName: company.name, message: `Company “${company.name}” created.` })
    }

    // Invite an Executive attached to an EXISTING company (optional — companies
    // don't require one).
    if (action === 'invite_executive') {
      const companyId = str(body.companyId), fullName = str(body.full_name)
      if (!companyId || !fullName || !body.email) return bad('Company, full name and email are required.')
      const ce = contactError(body.email, body.phone); if (ce) return bad(ce)
      const { data: company } = await admin.from('companies').select('id').eq('id', companyId).single()
      if (!company) return bad('Company not found.')
      const inv = await inviteUser({ email: body.email, role: 'executive', companyId, roleLabel: 'Executive', baseUrl: origin, link: {}, profile: { fullName, phone: normalisePhone(body.phone), address: str(body.address) } })
      await logAudit(admin, { actorId: user.id, companyId, action: 'admin.invite_executive', entityType: 'user', entityId: inv.userId, metadata: { email: body.email } })
      return done({ actionLink: inv.actionLink, emailed: inv.emailed, message: inv.emailed ? 'Executive invited — activation link emailed.' : 'Executive created. Email not sent — copy the activation link below.' })
    }

    if (action === 'create_executive') {
      const companyName = str(body.companyName), fullName = str(body.full_name)
      if (!companyName || !fullName || !body.email) return bad('Company name, full name and email are required.')
      const ce = contactError(body.email, body.phone); if (ce) return bad(ce)
      const { data: company, error: cErr } = await admin.from('companies').insert({ name: companyName }).select('id').single()
      if (cErr || !company) return bad(cErr?.message ?? 'Could not create company.')
      try {
        const inv = await inviteUser({ email: body.email, role: 'executive', companyId: company.id, roleLabel: 'Executive', baseUrl: origin, link: {}, profile: { fullName, phone: normalisePhone(body.phone), address: str(body.address) } })
        await logAudit(admin, { actorId: user.id, companyId: company.id, action: 'admin.create_executive', entityType: 'user', entityId: inv.userId, metadata: { email: body.email, companyName } })
        return done({ actionLink: inv.actionLink, emailed: inv.emailed, message: inv.emailed ? 'Executive created — activation link emailed.' : 'Executive created. Email not sent — copy the activation link below.' })
      } catch (e) { await admin.from('companies').delete().eq('id', company.id); return bad(errMsg(e, 'Invite failed.')) }
    }

    if (action === 'invite_rm') {
      const companyId = str(body.companyId), fullName = str(body.full_name)
      if (!companyId || !fullName || !body.email) return bad('Company, full name and email are required.')
      const ce = contactError(body.email, body.phone); if (ce) return bad(ce)

      // Optional project: when chosen, the invite email references the project name.
      let invitedTo: string | undefined
      const projectId = str(body.projectId)
      if (projectId) {
        const { data: project } = await admin.from('projects').select('id, name, company_id').eq('id', projectId).single()
        if (!project || project.company_id !== companyId) return bad('That project is not in the selected company.')
        invitedTo = project.name
      }

      let regionId = str(body.regionId)
      if (!regionId && str(body.newRegionName)) {
        const code = String(body.newRegionCode || body.newRegionName).toUpperCase().replace(/\s+/g, '').slice(0, 12)
        const { data: r, error } = await admin.from('regions').insert({ company_id: companyId, name: str(body.newRegionName), region_code: code }).select('id').single()
        if (error || !r) return bad(error?.message ?? 'Could not create region.')
        regionId = r.id
      }
      // A region is required for a normal RM, but a project-only invite (client project
      // manager) may skip it — they view the project without an estate region.
      if (!regionId && !projectId) return bad('Choose a region, create one, or select a project.')
      if (regionId) {
        const { data: region } = await admin.from('regions').select('id, company_id').eq('id', regionId).single()
        if (!region || region.company_id !== companyId) return bad('That region is not in the selected company.')
      }
      const inv = await inviteUser({ email: body.email, role: 'regional_manager', companyId, roleLabel: 'Regional Manager', baseUrl: origin, link: regionId ? { regionId } : {}, profile: { fullName, phone: normalisePhone(body.phone), address: str(body.address) }, invitedTo })
      await logAudit(admin, { actorId: user.id, companyId, action: 'admin.invite_rm', entityType: 'user', entityId: inv.userId, metadata: { email: body.email, regionId: regionId || null, projectId: projectId || null } })
      return done({ actionLink: inv.actionLink, emailed: inv.emailed, message: inv.emailed ? `Regional Manager invited${invitedTo ? ` to ${invitedTo}` : ''} — activation link emailed.` : 'Created. Email not sent — copy the activation link below.' })
    }

    if (action === 'invite_sm') {
      const companyId = str(body.companyId), regionId = str(body.regionId)
      const storeName = str(body.storeName), branchCode = str(body.branchCode), fullName = str(body.full_name)
      // Region is OPTIONAL: a store can be created unassigned and linked to a
      // region (and thus an RM) later on the Hierarchy tab.
      if (!companyId || !storeName || !branchCode || !fullName || !body.email) return bad('Company, store name, branch code, full name and email are required.')
      const ce = contactError(body.email, body.phone); if (ce) return bad(ce)
      let regionIdCol: string | null = null
      let regionCodeCol: string | null = null
      if (regionId) {
        const { data: region } = await admin.from('regions').select('id, company_id, region_code').eq('id', regionId).single()
        if (!region || region.company_id !== companyId) return bad('That region is not in the selected company.')
        regionIdCol = region.id; regionCodeCol = region.region_code
      }
      const bcode = branchCode.toUpperCase()
      const subStore = str(body.subStore) || storeName
      const { data: store, error: sErr } = await admin.from('stores')
        .insert({ company_id: companyId, region_id: regionIdCol, region_code: regionCodeCol, branch_code: bcode, name: storeName, sub_store: subStore })
        .select('id').single()
      if (sErr || !store) return bad(/duplicate/i.test(sErr?.message ?? '') ? 'That branch code already exists.' : (sErr?.message ?? 'Could not create store.'))
      try {
        const inv = await inviteUser({ email: body.email, role: 'store_manager', companyId, roleLabel: 'Store Manager', baseUrl: origin, link: { storeId: store.id }, profile: { fullName, phone: normalisePhone(body.phone), address: str(body.address), subStore, branchCode: bcode } })
        await logAudit(admin, { actorId: user.id, companyId, action: 'admin.invite_sm', entityType: 'user', entityId: inv.userId, metadata: { email: body.email, storeId: store.id } })
        return done({ actionLink: inv.actionLink, emailed: inv.emailed, message: inv.emailed ? 'Store Manager invited — activation link emailed.' : 'Created. Email not sent — copy the activation link below.' })
      } catch (e) { await admin.from('stores').delete().eq('id', store.id); return bad(errMsg(e, 'Invite failed.')) }
    }

    // Bulk import: one CSV of the chosen role. Company/region resolved by name.
    if (action === 'bulk') {
      const role = str(body.role)
      const rows = Array.isArray(body.rows) ? (body.rows as Record<string, string>[]) : []
      if (!['executive', 'regional_manager', 'store_manager'].includes(role)) return bad('Choose a role for the import.')
      if (!rows.length) return bad('No rows found — check the CSV.')
      const results: { label: string; ok: boolean; error?: string }[] = []
      for (const [i, row] of rows.entries()) {
        const email = str(row.email), fullName = str(row.full_name)
        const label = email || `Row ${i + 1}`
        try {
          if (!fullName || !email) throw new Error('Full name and email required')
          const ce = contactError(email, row.phone); if (ce) throw new Error(ce)
          const prof = { fullName, phone: normalisePhone(row.phone), address: str(row.address) }
          if (role === 'executive') {
            const companyId = await findOrCreateCompany(admin, str(row.company_name))
            if (!companyId) throw new Error('Company name required')
            await inviteUser({ email, role: 'executive', companyId, roleLabel: 'Executive', baseUrl: origin, link: {}, profile: prof })
          } else if (role === 'regional_manager') {
            const companyId = await findOrCreateCompany(admin, str(row.company_name)); if (!companyId) throw new Error('Company name required')
            const regionId = await findOrCreateRegion(admin, companyId, str(row.region_name || row.region_code), str(row.region_code)); if (!regionId) throw new Error('Region required')
            await inviteUser({ email, role: 'regional_manager', companyId, roleLabel: 'Regional Manager', baseUrl: origin, link: { regionId }, profile: prof })
          } else {
            const companyId = await findOrCreateCompany(admin, str(row.company_name)); if (!companyId) throw new Error('Company name required')
            const regionId = await findOrCreateRegion(admin, companyId, str(row.region_name || row.region_code), str(row.region_code)); if (!regionId) throw new Error('Region required')
            const storeName = str(row.store_name), branchCode = str(row.branch_code)
            if (!storeName || !branchCode) throw new Error('Store name and branch code required')
            const { data: region } = await admin.from('regions').select('region_code').eq('id', regionId).single()
            const bcode = branchCode.toUpperCase(), subStore = str(row.branch_name) || storeName
            const { data: store, error: sErr } = await admin.from('stores').insert({ company_id: companyId, region_id: regionId, region_code: region?.region_code, branch_code: bcode, name: storeName, sub_store: subStore }).select('id').single()
            if (sErr || !store) throw new Error(/duplicate/i.test(sErr?.message ?? '') ? 'Branch code already exists' : (sErr?.message ?? 'Could not create store'))
            try { await inviteUser({ email, role: 'store_manager', companyId, roleLabel: 'Store Manager', baseUrl: origin, link: { storeId: store.id }, profile: { ...prof, subStore, branchCode: bcode } }) }
            catch (e) { await admin.from('stores').delete().eq('id', store.id); throw e }
          }
          results.push({ label, ok: true })
        } catch (e) { results.push({ label, ok: false, error: errMsg(e, 'Failed') }) }
      }
      revalidatePath('/admin/accounts'); revalidatePath('/admin/hierarchy')
      await logAudit(admin, { actorId: user.id, action: 'admin.bulk_import', metadata: { role, total: rows.length, succeeded: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length } })
      return NextResponse.json({ ok: true, results })
    }

    // Move a store to another region within the SAME company (re-links its SM under
    // that region's RM).
    if (action === 'move_store') {
      const storeId = str(body.storeId), regionId = str(body.regionId)
      if (!storeId || !regionId) return bad('Store and region are required.')
      const { data: store } = await admin.from('stores').select('id, company_id').eq('id', storeId).single()
      const { data: region } = await admin.from('regions').select('id, company_id, region_code').eq('id', regionId).single()
      if (!store || !region) return bad('Store or region not found.')
      if (store.company_id !== region.company_id) return bad('A store can only move between regions of its own company.')
      await admin.from('stores').update({ region_id: regionId, region_code: region.region_code }).eq('id', storeId)
      // Re-home the store's existing tickets to the new region too, so the region's
      // RM sees the store's history (region_id was set at ticket-creation time and
      // would otherwise be stale/null for a store that had no region).
      await admin.from('tickets').update({ region_id: regionId }).eq('store_id', storeId)
      await logAudit(admin, { actorId: user.id, companyId: store.company_id, action: 'admin.move_store', entityType: 'store', entityId: storeId, metadata: { regionId } })
      revalidatePath('/admin/hierarchy'); revalidatePath('/regional/tickets'); revalidatePath('/regional')
      return NextResponse.json({ ok: true, message: 'Store moved.' })
    }

    // Re-link a Regional Manager to a region (sets their company + sole region).
    if (action === 'relink_rm') {
      const userId = str(body.userId), regionId = str(body.regionId)
      if (!userId || !regionId) return bad('Manager and region are required.')
      const { data: region } = await admin.from('regions').select('id, company_id').eq('id', regionId).single()
      if (!region) return bad('Region not found.')
      await admin.from('user_profiles').update({ company_id: region.company_id, requested_region_code: null }).eq('id', userId).eq('role', 'regional_manager')
      await admin.from('regional_users').delete().eq('user_id', userId)
      await admin.from('regional_users').insert({ user_id: userId, region_id: regionId })
      await logAudit(admin, { actorId: user.id, companyId: region.company_id, action: 'admin.relink_rm', entityType: 'user', entityId: userId, metadata: { regionId } })
      revalidatePath('/admin/hierarchy')
      return NextResponse.json({ ok: true, message: 'Regional manager re-linked.' })
    }

    // Invite (or link) a supplier under a company. Suppliers are competing
    // outsiders shared across companies — an existing supplier is reused.
    if (action === 'invite_supplier') {
      const companyId = str(body.companyId), email = str(body.email).toLowerCase(), supplierName = str(body.supplierName)
      if (!companyId) return bad('Company is required.')
      if (!isValidEmail(email)) return bad('Enter a valid email address.')
      if (body.phone && !isValidPhone(String(body.phone))) return bad('Enter a valid phone number.')
      const { data: company } = await admin.from('companies').select('id, name').eq('id', companyId).single()
      if (!company) return bad('Company not found.')
      const r = await linkOrInviteSupplier(admin, { companyId, supplierName, email, phone: normalisePhone(body.phone), address: str(body.address), actorId: user.id, origin, inviterCompany: company.name })
      await logAudit(admin, { actorId: user.id, companyId, action: 'admin.invite_supplier', entityType: 'supplier', entityId: r.supplierId, metadata: { email } })
      revalidatePath('/admin/accounts'); revalidatePath('/admin/suppliers')
      return NextResponse.json({ ok: true, emailed: r.emailed, actionLink: r.actionLink, message: r.message })
    }

    // Bulk-invite suppliers under one company (CSV). Columns: supplier_name,
    // email, phone, address.
    if (action === 'bulk_suppliers') {
      const companyId = str(body.companyId)
      const rows = Array.isArray(body.rows) ? (body.rows as Record<string, string>[]) : []
      if (!companyId) return bad('Company is required.')
      if (!rows.length) return bad('No rows found — check the CSV.')
      const { data: company } = await admin.from('companies').select('id, name').eq('id', companyId).single()
      if (!company) return bad('Company not found.')
      const results: { label: string; ok: boolean; error?: string }[] = []
      for (const [i, row] of rows.entries()) {
        const email = str(row.email).toLowerCase()
        const label = email || `Row ${i + 1}`
        try {
          if (!isValidEmail(email)) throw new Error('Valid email required')
          await linkOrInviteSupplier(admin, { companyId, supplierName: str(row.supplier_name || row.company_name), email, phone: normalisePhone(row.phone), address: str(row.address), actorId: user.id, origin, inviterCompany: company.name })
          results.push({ label, ok: true })
        } catch (e) { results.push({ label, ok: false, error: errMsg(e, 'Failed') }) }
      }
      await logAudit(admin, { actorId: user.id, companyId, action: 'admin.bulk_suppliers', metadata: { total: rows.length, succeeded: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length } })
      revalidatePath('/admin/accounts'); revalidatePath('/admin/suppliers')
      return NextResponse.json({ ok: true, results })
    }

    return bad('Unknown action')
  } catch (e) {
    return NextResponse.json({ error: errMsg(e, 'Failed') }, { status: 400 })
  }
}
