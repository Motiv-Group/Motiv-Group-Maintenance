// Seeds the DEV Supabase project with an isolated, tagged test fixture:
// one company, one region, one store, one auth user per role, two competing
// supplier orgs, and two tickets (one awarded to supplier A with an invite to
// nobody else — the cross-supplier isolation probe). Everything is tagged so
// teardown can remove it exactly; re-running is idempotent (upsert-by-email).
//
// Runs ONLY through e2e/env.ts (which refuses production). Never import
// lib/supabase/server here — this is a standalone node script.

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import { loadE2eEnv } from './env'

export const E2E_TAG = 'motiv-e2e'
export const E2E_PASSWORD = 'E2e-smoke-Passw0rd!'
export const ROLES = ['store_manager', 'regional_manager', 'supplier', 'executive', 'individual', 'system_admin'] as const
export type E2eRole = (typeof ROLES)[number]
export const emailFor = (role: E2eRole) => `${role.replace('_', '-')}@${E2E_TAG}.test`
// A second supplier org + user for the cross-supplier isolation probe.
export const SUPPLIER_B_EMAIL = `supplier-b@${E2E_TAG}.test`

export interface SeedResult {
  companyId: string
  regionId: string
  storeId: string
  supplierAId: string
  supplierBId: string
  awardedTicketId: string
  openTicketId: string
  closeoutTicketId: string
  completedTicketId: string
}

const makeAdmin = (url: string, key: string) =>
  createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
type Admin = ReturnType<typeof makeAdmin>

async function upsertUser(admin: Admin, email: string, role: string, companyId: string | null): Promise<string> {
  // Find-or-create the auth user (admin API), then force the profile row.
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const existing = list?.users.find(u => u.email === email)
  let id: string
  if (existing) {
    id = existing.id
    await admin.auth.admin.updateUserById(id, { password: E2E_PASSWORD, email_confirm: true })
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password: E2E_PASSWORD, email_confirm: true })
    if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`)
    id = data.user.id
  }
  // handle_new_user created a profile clamped to 'individual'; set the real role.
  const { error: pErr } = await admin.from('user_profiles').upsert({
    id, email, role, company_id: companyId, full_name: `E2E ${role}`,
  })
  if (pErr) throw new Error(`profile ${email}: ${pErr.message}`)
  return id
}

export async function seed(): Promise<SeedResult> {
  const env = loadE2eEnv()
  const admin = makeAdmin(env.supabaseUrl, env.serviceRoleKey)

  // Company / region / store (find-or-create by tagged name).
  type Tables = Database['public']['Tables']
  const one = async <T extends 'companies' | 'regions' | 'stores' | 'suppliers'>(
    table: T, match: Partial<Tables[T]['Row']>, insert: Tables[T]['Insert'],
  ): Promise<string> => {
    const { data: found } = await admin.from(table).select('id').match(match).limit(1).maybeSingle()
    if (found) return (found as unknown as { id: string }).id
    const { data, error } = await admin.from(table).insert(insert as never).select('id').single()
    if (error || !data) throw new Error(`${table}: ${error?.message}`)
    return (data as unknown as { id: string }).id
  }

  const companyId = await one('companies', { name: `${E2E_TAG} Co` }, { name: `${E2E_TAG} Co` })
  const regionId = await one('regions', { company_id: companyId, region_code: 'E2E' }, { company_id: companyId, region_code: 'E2E', name: `${E2E_TAG} Region` })
  const storeId = await one('stores', { company_id: companyId, branch_code: 'E2E-001' }, { company_id: companyId, region_id: regionId, region_code: 'E2E', branch_code: 'E2E-001', name: `${E2E_TAG} Store` })
  const supplierAId = await one('suppliers', { company_name: `${E2E_TAG} Supplier A` }, { company_name: `${E2E_TAG} Supplier A`, company_id: companyId, verification_status: 'verified' })
  const supplierBId = await one('suppliers', { company_name: `${E2E_TAG} Supplier B` }, { company_name: `${E2E_TAG} Supplier B`, company_id: companyId, verification_status: 'verified' })

  // Users per role + links.
  const sm = await upsertUser(admin, emailFor('store_manager'), 'store_manager', companyId)
  const rm = await upsertUser(admin, emailFor('regional_manager'), 'regional_manager', companyId)
  const supA = await upsertUser(admin, emailFor('supplier'), 'supplier', companyId)
  const supB = await upsertUser(admin, SUPPLIER_B_EMAIL, 'supplier', companyId)
  await upsertUser(admin, emailFor('executive'), 'executive', companyId)
  await upsertUser(admin, emailFor('individual'), 'individual', null)
  await upsertUser(admin, emailFor('system_admin'), 'system_admin', companyId)

  const link = async <T extends 'store_users' | 'regional_users' | 'supplier_users' | 'ticket_suppliers'>(
    table: T, row: Tables[T]['Insert'],
  ) => {
    const { data: hit } = await admin.from(table).select('*').match(row as Record<string, unknown>).limit(1).maybeSingle()
    if (!hit) {
      const { error } = await admin.from(table).insert(row as never)
      if (error) throw new Error(`${table}: ${error.message}`)
    }
  }
  await link('store_users', { user_id: sm, store_id: storeId })
  await link('regional_users', { user_id: rm, region_id: regionId })
  await link('supplier_users', { user_id: supA, supplier_id: supplierAId })
  await link('supplier_users', { user_id: supB, supplier_id: supplierBId })

  // Accept the current SLA for both supplier users — otherwise the SLA
  // interstitial intercepts every supplier page and the isolation probe would
  // test the SLA wall instead of the real ticket gate. Version must match
  // lib/sla.ts SLA_VERSION.
  for (const [uid, sid] of [[supA, supplierAId], [supB, supplierBId]] as const) {
    const { data: acc } = await admin.from('supplier_sla_acceptances')
      .select('id').eq('user_id', uid).eq('sla_version', '1.0').limit(1).maybeSingle()
    if (!acc) {
      const { error } = await admin.from('supplier_sla_acceptances')
        .insert({ user_id: uid, supplier_id: sid, sla_version: '1.0', signed_name: 'E2E supplier' })
      if (error) throw new Error(`sla acceptance: ${error.message}`)
    }
  }

  // Tickets: one AWARDED to supplier A (invite for A only) — supplier B must not
  // see it; one open unassigned ticket for general rendering.
  const ticket = async (title: string, extra: Record<string, unknown>): Promise<string> => {
    const { data: found } = await admin.from('tickets').select('id').eq('title', title).limit(1).maybeSingle()
    if (found) return (found as unknown as { id: string }).id
    const { data, error } = await admin.from('tickets').insert({
      title, description: 'seeded by the e2e smoke suite', company_id: companyId, store_id: storeId,
      region_id: regionId, region_code: 'E2E', created_by: sm, category: 'General',
      operational_impact: 'none', priority: 'P3', severity: 'low', ...extra,
    }).select('id').single()
    if (error || !data) throw new Error(`ticket: ${error?.message}`)
    return (data as { id: string }).id
  }
  const awardedTicketId = await ticket(`${E2E_TAG} awarded ticket`, { status: 'in_progress', supplier_id: supplierAId })
  await link('ticket_suppliers', { ticket_id: awardedTicketId, supplier_id: supplierAId })
  const openTicketId = await ticket(`${E2E_TAG} open ticket`, { status: 'open' })

  // End-of-life tickets carrying a completion (COC + invoice + before/after) — the
  // close-out and completed states. These exercise the completion / documents /
  // timeline render paths the nav-only smoke matrix never opened.
  // A completion carries: an accepted quote (with ref + file), a signoff (COC +
  // invoice + before/after photos), and an approved variation with an attachment —
  // the full data a real end-of-life ticket's detail page renders.
  const completionData = async (ticketId: string) => {
    const { data: hit } = await admin.from('signoffs').select('id').eq('ticket_id', ticketId).limit(1).maybeSingle()
    if (hit) return
    const sErr = (await admin.from('signoffs').insert({
      ticket_id: ticketId, supplier_id: supplierAId, company_id: companyId, status: 'accepted',
      coc_url: `${E2E_TAG}/coc.pdf`, invoice_url: `${E2E_TAG}/invoice.pdf`,
      before_urls: [`${E2E_TAG}/before-1.jpg`], after_urls: [`${E2E_TAG}/after-1.jpg`],
      reviewed_at: new Date().toISOString(),
    })).error
    if (sErr) throw new Error(`signoff: ${sErr.message}`)
    const qErr = (await admin.from('quotes').insert({
      ticket_id: ticketId, supplier_id: supplierAId, company_id: companyId, status: 'accepted',
      amount: 1000, amount_incl_vat: 1150, description: 'seeded quote', quote_ref: 'Q-E2E-1', file_url: `${E2E_TAG}/quote.pdf`,
    })).error
    if (qErr) throw new Error(`quote: ${qErr.message}`)
    const vErr = (await admin.from('ticket_variations').insert({
      ticket_id: ticketId, supplier_id: supplierAId, company_id: companyId, status: 'approved',
      description: 'seeded variation', amount: 200, warranty: '12 months', reviewed_at: new Date().toISOString(), file_urls: [`${E2E_TAG}/vo-1.pdf`],
    })).error
    if (vErr) throw new Error(`variation: ${vErr.message}`)
  }
  const signoff = completionData
  const closeoutTicketId = await ticket(`${E2E_TAG} closeout ticket`, { status: 'approved_closeout', supplier_id: supplierAId })
  await link('ticket_suppliers', { ticket_id: closeoutTicketId, supplier_id: supplierAId })
  await signoff(closeoutTicketId)
  const completedTicketId = await ticket(`${E2E_TAG} completed ticket`, { status: 'completed', supplier_id: supplierAId })
  await link('ticket_suppliers', { ticket_id: completedTicketId, supplier_id: supplierAId })
  await signoff(completedTicketId)

  return { companyId, regionId, storeId, supplierAId, supplierBId, awardedTicketId, openTicketId, closeoutTicketId, completedTicketId }
}

export async function teardown(): Promise<void> {
  const env = loadE2eEnv()
  const admin = makeAdmin(env.supabaseUrl, env.serviceRoleKey)
  // Delete tagged tickets + company graph, then the tagged auth users.
  const { data: co } = await admin.from('companies').select('id').eq('name', `${E2E_TAG} Co`).maybeSingle()
  if (co) {
    const companyId = (co as { id: string }).id
    await admin.from('tickets').delete().eq('company_id', companyId)
    await admin.from('suppliers').delete().eq('company_id', companyId)
    await admin.from('stores').delete().eq('company_id', companyId)
    await admin.from('regions').delete().eq('company_id', companyId)
    await admin.from('companies').delete().eq('id', companyId)
  }
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of list?.users ?? []) {
    if (u.email?.endsWith(`@${E2E_TAG}.test`)) await admin.auth.admin.deleteUser(u.id)
  }
}
