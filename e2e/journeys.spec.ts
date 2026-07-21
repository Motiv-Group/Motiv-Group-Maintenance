// Full workflow-journey e2e (second external audit, finding 2b — the suite was
// smoke-only). Drives the REAL API routes with the auth cookies saved by
// global-setup (one Playwright request context per role) and asserts the DB
// outcome of every step through a service-role supabase-js client — the same
// pattern seed.ts uses. Three journeys:
//
//   1. Happy path   — SM logs → RM invites → supplier quotes → RM awards →
//                     supplier works & submits → RM approves → close-out.
//   2. Dispute      — supplier disputes an evidence request; the disputed step
//                     409s while the dispute is open; the RM resolves it and the
//                     flow continues.
//   3. Snag chain   — RM raises a snag instead of approving; supplier accepts,
//                     fixes, resubmits; RM approves and closes out.
//
// Every step follows lib/workflow.ts TRANSITIONS + the actual route handlers
// (assign / submit-quote / quote-decision / transition / dispute /
// supplier/ticket-action). Fresh tickets are created via the API inside each
// test — never the seeded smoke tickets — and titled 'motiv-e2e journey …' so
// the tagged teardown covers them; an afterAll also removes them directly.

import { test, expect, request, type APIRequestContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { stateFor } from './global-setup'
import { loadE2eEnv } from './env'
import type { Database } from '../lib/database.types'
import type { SeedResult } from './seed'

const fixture = (): SeedResult =>
  JSON.parse(readFileSync(resolve(__dirname, '.auth', 'fixture.json'), 'utf8'))

const makeAdmin = () => {
  const env = loadE2eEnv()
  return createClient<Database>(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

test.describe('workflow journeys', () => {
  test.describe.configure({ mode: 'serial' })

  let sm: APIRequestContext  // store manager
  let rm: APIRequestContext  // regional manager
  let sup: APIRequestContext // supplier A user
  let supB: APIRequestContext // supplier B user (competitive quoting / auto-decline)
  let admin: ReturnType<typeof makeAdmin>
  let fx: SeedResult
  const createdTicketIds: string[] = []

  test.beforeAll(async ({}, workerInfo) => {
    const baseURL = (workerInfo.project.use.baseURL as string | undefined) ?? 'http://localhost:3100'
    fx = fixture()
    admin = makeAdmin()
    sm = await request.newContext({ baseURL, storageState: stateFor('store_manager') })
    rm = await request.newContext({ baseURL, storageState: stateFor('regional_manager') })
    sup = await request.newContext({ baseURL, storageState: stateFor('supplier') })
    supB = await request.newContext({ baseURL, storageState: stateFor('supplier-b') })
  })

  test.afterAll(async () => {
    // Best-effort direct cleanup (child rows first — most ticket FKs have no ON
    // DELETE CASCADE). The tagged teardown's company delete is the backstop.
    if (admin && createdTicketIds.length) {
      await admin.from('ticket_dispute_messages').delete().in('ticket_id', createdTicketIds)
      await admin.from('ticket_disputes').delete().in('ticket_id', createdTicketIds)
      await admin.from('snag_schedule_events').delete().in('ticket_id', createdTicketIds)
      await admin.from('snags').delete().in('ticket_id', createdTicketIds)
      await admin.from('signoff_rounds').delete().in('ticket_id', createdTicketIds)
      await admin.from('signoffs').delete().in('ticket_id', createdTicketIds)
      await admin.from('ticket_evidence').delete().in('ticket_id', createdTicketIds)
      await admin.from('ticket_variations').delete().in('ticket_id', createdTicketIds)
      await admin.from('ticket_quote_requests').delete().in('ticket_id', createdTicketIds)
      await admin.from('ticket_supplier_declines').delete().in('ticket_id', createdTicketIds)
      await admin.from('ticket_views').delete().in('ticket_id', createdTicketIds)
      await admin.from('ticket_reads').delete().in('ticket_id', createdTicketIds)
      await admin.from('ticket_updates').delete().in('ticket_id', createdTicketIds)
      await admin.from('ticket_suppliers').delete().in('ticket_id', createdTicketIds)
      await admin.from('quotes').delete().in('ticket_id', createdTicketIds)
      await admin.from('tickets').delete().in('id', createdTicketIds)
    }
    await Promise.all([sm, rm, sup, supB].map(c => c?.dispose()))
  })

  // ---------- helpers ----------

  /** POST an API route and require 2xx; failure message carries status + body. */
  async function api(ctx: APIRequestContext, path: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await ctx.post(path, { data })
    const text = await res.text()
    expect(res.ok(), `POST ${path} ${JSON.stringify(data)} → ${res.status()} ${text}`).toBe(true)
    try { return JSON.parse(text) as Record<string, unknown> } catch { return {} }
  }

  /** POST an API route expecting a specific NON-2xx status; returns the body text. */
  async function apiExpectStatus(ctx: APIRequestContext, path: string, data: Record<string, unknown>, want: number): Promise<string> {
    const res = await ctx.post(path, { data })
    const text = await res.text()
    expect(res.status(), `POST ${path} ${JSON.stringify(data)} → ${res.status()} ${text} (wanted ${want})`).toBe(want)
    return text
  }

  async function getTicket(id: string) {
    const { data, error } = await admin.from('tickets')
      .select('id, status, supplier_id, company_id, vo_none_confirmed_at')
      .eq('id', id).single()
    if (error || !data) throw new Error(`getTicket(${id}): ${error?.message ?? 'no row'}`)
    return data
  }

  async function expectTicketStatus(id: string, want: string, step: string) {
    const t = await getTicket(id)
    expect(t.status, `${step}: DB ticket.status`).toBe(want)
  }

  /** Run a lifecycle move via /transition and assert both the response and the DB. */
  async function transition(ctx: APIRequestContext, ticketId: string, action: string, extra: Record<string, unknown>, expectTo: string) {
    const body = await api(ctx, `/api/tickets/${ticketId}/transition`, { action, ...extra })
    expect(body.status, `transition ${action}: response status field`).toBe(expectTo)
    await expectTicketStatus(ticketId, expectTo, `after ${action}`)
  }

  /** SM logs a fresh journey ticket via the real create route. */
  async function createTicket(suffix: string): Promise<string> {
    const body = await api(sm, '/api/tickets', {
      title: `motiv-e2e journey ${suffix}`,
      description: `motiv-e2e journey ${suffix} — created by e2e/journeys.spec.ts`,
      category: 'General',
      operational_impact: 'none',
    })
    const ticket = body.ticket as { id?: string; status?: string } | undefined
    expect(ticket?.id, 'create-ticket response should contain ticket.id').toBeTruthy()
    expect(ticket?.status, 'freshly logged ticket status').toBe('open')
    createdTicketIds.push(ticket!.id!)
    return ticket!.id!
  }

  /** The latest pending quote on a ticket (submit-quote returns only { ok }). */
  async function pendingQuote(ticketId: string) {
    const { data, error } = await admin.from('quotes')
      .select('id, supplier_id, status, amount')
      .eq('ticket_id', ticketId).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error || !data) throw new Error(`pendingQuote(${ticketId}): ${error?.message ?? 'no pending quote row'}`)
    return data
  }

  async function latestSnag(ticketId: string) {
    const { data, error } = await admin.from('snags')
      .select('id, status, schedule_status, scheduled_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error || !data) throw new Error(`latestSnag(${ticketId}): ${error?.message ?? 'no snag row'}`)
    return data
  }

  /**
   * Shared prefix used by all three journeys:
   * open → assigned (RM invites supplier A) → quoted (supplier submits) →
   * accepted (RM awards via quote-decision) → in_progress → submitted_for_signoff.
   */
  async function driveToSignoff(ticketId: string, amount: number) {
    await api(rm, `/api/tickets/${ticketId}/assign`, { supplierIds: [fx.supplierAId] })
    await expectTicketStatus(ticketId, 'assigned', 'after RM assign (invite supplier A)')

    await api(sup, `/api/tickets/${ticketId}/submit-quote`, { amount, description: 'e2e journey quote' })
    await expectTicketStatus(ticketId, 'quoted', 'after supplier submit-quote')
    const quote = await pendingQuote(ticketId)
    expect(quote.supplier_id, 'quote belongs to supplier A org').toBe(fx.supplierAId)

    // No proposed_schedule_at on the quote → award lands on 'accepted'.
    await api(rm, `/api/tickets/${ticketId}/quote-decision`, { action: 'approve', quoteId: quote.id })
    const awarded = await getTicket(ticketId)
    expect(awarded.status, 'after RM quote-decision approve').toBe('accepted')
    expect(awarded.supplier_id, 'ticket awarded to supplier A org').toBe(fx.supplierAId)

    await transition(sup, ticketId, 'start_work', {}, 'in_progress')
    await transition(sup, ticketId, 'submit_completion', { notes: 'e2e journey completion' }, 'submitted_for_signoff')
  }

  /** Close-out tail: supplier confirms no further VOs, then the RM closes out. */
  async function closeOut(ticketId: string) {
    // close_out is 409-blocked until the supplier confirms there are no more VOs.
    await apiExpectStatus(rm, `/api/tickets/${ticketId}/transition`, { action: 'close_out' }, 409)
    await api(sup, '/api/supplier/ticket-action', { ticketId, action: 'confirm_no_vos' })
    await transition(rm, ticketId, 'close_out', {}, 'completed')
  }

  // ---------- uploads · attachments · view-tracking ----------

  // Smallest byte payloads that pass the /api/uploads MIME sniff (part content-type
  // must not be octet-stream): a 1×1 PNG and a minimal PDF.
  const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  )
  const PDF_MIN = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'utf8')

  /** Upload a file through the REAL /api/uploads route → its stored URL. Exercises
   *  the server upload path + per-bucket MIME allowlist; the URL then rides on a
   *  quote / variation / evidence row as a genuine attachment. */
  async function uploadFile(ctx: APIRequestContext, bucket: string, name: string, mimeType: string, buffer: Buffer): Promise<string> {
    const res = await ctx.post('/api/uploads', { multipart: { bucket, files: { name, mimeType, buffer } } })
    const text = await res.text()
    expect(res.ok(), `upload → ${bucket} ${res.status()} ${text}`).toBe(true)
    const body = JSON.parse(text) as { urls?: string[] }
    const url = body.urls?.[0]
    expect(url, `upload returned a URL (${text})`).toBeTruthy()
    return url!
  }

  /** Record that a viewer opened an item on a ticket (first-view-wins audit). */
  async function recordView(ctx: APIRequestContext, ticketId: string, itemType: string, itemLabel: string) {
    await api(ctx, `/api/tickets/${ticketId}/view`, { itemType, itemLabel })
  }
  async function viewCount(ticketId: string, itemType: string, itemLabel: string): Promise<number> {
    const { count } = await admin.from('ticket_views')
      .select('id', { count: 'exact', head: true })
      .eq('ticket_id', ticketId).eq('item_type', itemType).eq('item_label', itemLabel)
    return count ?? 0
  }

  // ---------- quote / variation / invite lookups ----------

  /** The latest quote for a specific supplier org on a ticket (any status). */
  async function quoteFor(ticketId: string, supplierId: string) {
    const { data, error } = await admin.from('quotes')
      .select('id, supplier_id, status, amount, amount_incl_vat, file_url, quote_ref')
      .eq('ticket_id', ticketId).eq('supplier_id', supplierId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error || !data) throw new Error(`quoteFor(${ticketId}, ${supplierId}): ${error?.message ?? 'no quote row'}`)
    return data
  }

  /** This supplier org's invite row on a ticket. */
  async function getInvite(ticketId: string, supplierId: string) {
    const { data, error } = await admin.from('ticket_suppliers')
      .select('supplier_id, status, declined_by, decline_reason, requote_requested_at')
      .eq('ticket_id', ticketId).eq('supplier_id', supplierId).maybeSingle()
    if (error || !data) throw new Error(`getInvite(${ticketId}, ${supplierId}): ${error?.message ?? 'no invite row'}`)
    return data
  }

  /** The latest variation order on a ticket. */
  async function latestVariation(ticketId: string) {
    const { data, error } = await admin.from('ticket_variations')
      .select('id, status, amount, amount_incl_vat, reject_reason, file_urls, description')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error || !data) throw new Error(`latestVariation(${ticketId}): ${error?.message ?? 'no variation row'}`)
    return data
  }

  /** PATCH a ticket (SM edit / add-info) — the app route is PATCH, not POST. */
  async function patchTicket(ctx: APIRequestContext, ticketId: string, data: Record<string, unknown>) {
    const res = await ctx.fetch(`/api/tickets/${ticketId}`, { method: 'PATCH', data })
    const text = await res.text()
    expect(res.ok(), `PATCH /api/tickets/${ticketId} ${JSON.stringify(data)} → ${res.status()} ${text}`).toBe(true)
  }

  // ---------- journeys ----------

  test('happy path: log → invite → quote → award → work → sign-off → close-out', async () => {
    test.setTimeout(240_000)
    const ticketId = await createTicket('happy path')

    await driveToSignoff(ticketId, 1234.5)

    await transition(rm, ticketId, 'approve', {}, 'approved_closeout')
    await closeOut(ticketId)

    // Final DB shape: completed, awarded to supplier A, with an accepted quote.
    const t = await getTicket(ticketId)
    expect(t.status).toBe('completed')
    expect(t.supplier_id, 'tickets.supplier_id is supplier A').toBe(fx.supplierAId)
    const { data: quotes } = await admin.from('quotes').select('id, status, supplier_id').eq('ticket_id', ticketId)
    expect(quotes?.length, 'exactly one quote row on the ticket').toBe(1)
    expect(quotes?.[0]?.status, 'the awarded quote is accepted').toBe('accepted')
    expect(quotes?.[0]?.supplier_id).toBe(fx.supplierAId)
  })

  test('dispute: supplier contests an evidence request; blocked step 409s until the RM resolves', async () => {
    test.setTimeout(240_000)
    const ticketId = await createTicket('dispute')

    await driveToSignoff(ticketId, 900)

    // RM sends the submission back for more evidence — the dispute-raisable state.
    await transition(rm, ticketId, 'request_evidence', { reason: 'e2e: need clearer after-photos' }, 'evidence_requested')

    // Supplier raises a dispute over the evidence request.
    await api(sup, `/api/tickets/${ticketId}/dispute`, { action: 'raise', body: 'e2e: the submitted evidence already covers this' })
    const { data: open } = await admin.from('ticket_disputes')
      .select('id, status, origin, outcome').eq('ticket_id', ticketId).eq('status', 'open').maybeSingle()
    expect(open, 'an open ticket_disputes row exists').toBeTruthy()
    expect(open?.origin, 'dispute origin').toBe('evidence_requested')

    // The disputed step is paused: resubmitting completion must 409 while open.
    const blocked = await apiExpectStatus(sup, `/api/tickets/${ticketId}/transition`, { action: 'submit_completion' }, 409)
    expect(blocked, 'the 409 explains the open dispute').toContain('dispute')
    await expectTicketStatus(ticketId, 'evidence_requested', 'still parked while disputed')

    // RM resolves by retracting the request (outcome "withdrawn" → the submission
    // goes back under review at submitted_for_signoff).
    await api(rm, `/api/tickets/${ticketId}/dispute`, { action: 'retract', note: 'e2e: agreed, evidence is sufficient' })
    const { data: resolved } = await admin.from('ticket_disputes')
      .select('status, outcome, resolved_at').eq('id', open!.id).single()
    expect(resolved?.status, 'dispute resolved').toBe('resolved')
    expect(resolved?.outcome, 'RM retraction outcome').toBe('withdrawn')
    expect(resolved?.resolved_at, 'resolved_at stamped').toBeTruthy()
    await expectTicketStatus(ticketId, 'submitted_for_signoff', 'submission back under review after retract')

    // Flow continues to the end.
    await transition(rm, ticketId, 'approve', {}, 'approved_closeout')
    await closeOut(ticketId)
  })

  test('snag chain: RM raises a snag; supplier schedules, fixes, resubmits; RM closes out', async () => {
    test.setTimeout(240_000)
    const ticketId = await createTicket('snag')

    await driveToSignoff(ticketId, 2500)

    // RM raises a snag instead of approving the sign-off.
    await transition(rm, ticketId, 'raise_snag', { description: 'e2e snag: paint already peeling', severity: 'minor' }, 'snag')
    expect((await latestSnag(ticketId)).status, 'snag row open after raise_snag').toBe('open')

    // Supplier accepts the snag and proposes a fix date (required by accept_snag).
    const fixAt = new Date(Date.now() + 24 * 3600_000).toISOString()
    await transition(sup, ticketId, 'accept_snag', { scheduledAt: fixAt }, 'snag_assigned')
    let snag = await latestSnag(ticketId)
    expect(snag.status, 'snag assigned after accept').toBe('assigned')
    expect(snag.schedule_status, 'fix date proposed, awaiting RM').toBe('proposed')

    // RM approves the proposed date (status stays snag_assigned; schedule → agreed).
    await transition(rm, ticketId, 'approve_snag', {}, 'snag_assigned')
    snag = await latestSnag(ticketId)
    expect(snag.schedule_status, 'snag schedule agreed after RM approval').toBe('agreed')

    // Supplier fixes and resubmits the completion pack.
    await transition(sup, ticketId, 'start_snag', {}, 'snag_in_progress')
    expect((await latestSnag(ticketId)).status).toBe('in_progress')
    await transition(sup, ticketId, 'submit_completion', { notes: 'e2e snag fixed' }, 'submitted_for_signoff')

    // RM approves the new submission — this also resolves the open snag.
    await transition(rm, ticketId, 'approve', {}, 'approved_closeout')
    expect((await latestSnag(ticketId)).status, 'snag resolved by sign-off approval').toBe('resolved')

    await closeOut(ticketId)
  })

  test('re-quote: RM declines the quote and asks for a revised one; supplier re-quotes and is awarded', async () => {
    test.setTimeout(240_000)
    const ticketId = await createTicket('requote')

    await api(rm, `/api/tickets/${ticketId}/assign`, { supplierIds: [fx.supplierAId] })
    await api(sup, `/api/tickets/${ticketId}/submit-quote`, { amount: 5000, description: 'e2e first quote (too high)' })
    await expectTicketStatus(ticketId, 'quoted', 'after first supplier quote')
    const q1 = await pendingQuote(ticketId)

    // The "decline + ask to re-quote" flow is two API calls: decline the quote,
    // then re-invite (the standalone 'requote' acts on the already-declined quote).
    await api(rm, `/api/tickets/${ticketId}/quote-decision`, { action: 'decline', quoteId: q1.id, reason: 'Please revise the price' })
    expect((await quoteFor(ticketId, fx.supplierAId)).status, 'first quote declined').toBe('declined')
    await api(rm, `/api/tickets/${ticketId}/quote-decision`, { action: 'requote', quoteId: q1.id })
    await expectTicketStatus(ticketId, 'quote_requested', 'ticket back to quote_requested after requote')
    const declined = await quoteFor(ticketId, fx.supplierAId)
    expect(declined.status, 'first quote stays declined after requote').toBe('declined')
    const reInvite = await getInvite(ticketId, fx.supplierAId)
    expect(reInvite.status, 're-invited supplier is back to invited').toBe('invited')
    expect(reInvite.requote_requested_at, 'requote_requested_at stamped').toBeTruthy()

    // Supplier submits a revised (lower) quote; RM awards it.
    await api(sup, `/api/tickets/${ticketId}/submit-quote`, { amount: 4000, description: 'e2e revised quote' })
    await expectTicketStatus(ticketId, 'quoted', 'after revised quote')
    const q2 = await pendingQuote(ticketId)
    expect(Number(q2.amount), 'revised quote amount').toBe(4000)
    expect(q2.id, 'revised quote is a new row').not.toBe(q1.id)

    await api(rm, `/api/tickets/${ticketId}/quote-decision`, { action: 'approve', quoteId: q2.id })
    await expectTicketStatus(ticketId, 'accepted', 'revised quote awarded')

    await transition(sup, ticketId, 'start_work', {}, 'in_progress')
    await transition(sup, ticketId, 'submit_completion', { notes: 'e2e requote completion' }, 'submitted_for_signoff')
    await transition(rm, ticketId, 'approve', {}, 'approved_closeout')
    await closeOut(ticketId)
  })

  test('competitive award: two suppliers quote; awarding one auto-declines & closes the other', async () => {
    test.setTimeout(240_000)
    const ticketId = await createTicket('multi-quote')

    // RM invites BOTH supplier orgs; each submits a quote.
    await api(rm, `/api/tickets/${ticketId}/assign`, { supplierIds: [fx.supplierAId, fx.supplierBId] })
    await expectTicketStatus(ticketId, 'assigned', 'after inviting A + B')
    await api(sup,  `/api/tickets/${ticketId}/submit-quote`, { amount: 6000, description: 'e2e supplier A quote' })
    await api(supB, `/api/tickets/${ticketId}/submit-quote`, { amount: 7000, description: 'e2e supplier B quote' })

    const qA = await quoteFor(ticketId, fx.supplierAId)
    expect(qA.status, 'A pending before award').toBe('pending')
    const qBpre = await quoteFor(ticketId, fx.supplierBId)
    expect(qBpre.status, 'B pending before award').toBe('pending')

    // RM awards A → the ticket is awarded to A and B is auto-declined/closed.
    await api(rm, `/api/tickets/${ticketId}/quote-decision`, { action: 'approve', quoteId: qA.id })
    const awarded = await getTicket(ticketId)
    expect(awarded.status, 'awarded → accepted').toBe('accepted')
    expect(awarded.supplier_id, 'awarded to supplier A').toBe(fx.supplierAId)
    expect((await quoteFor(ticketId, fx.supplierAId)).status, 'A quote accepted').toBe('accepted')
    expect((await quoteFor(ticketId, fx.supplierBId)).status, 'B quote auto-declined').toBe('declined')
    expect((await getInvite(ticketId, fx.supplierBId)).status, 'B invite auto-closed').toBe('closed')

    await transition(sup, ticketId, 'start_work', {}, 'in_progress')
    await transition(sup, ticketId, 'submit_completion', { notes: 'e2e competitive completion' }, 'submitted_for_signoff')
    await transition(rm, ticketId, 'approve', {}, 'approved_closeout')
    await closeOut(ticketId)
  })

  test('decline work: the sole invited supplier declines the request; the ticket reopens and is re-assigned', async () => {
    test.setTimeout(240_000)
    const ticketId = await createTicket('decline-work')

    await api(rm, `/api/tickets/${ticketId}/assign`, { supplierIds: [fx.supplierAId] })
    await expectTicketStatus(ticketId, 'assigned', 'after inviting A')

    // Supplier A opts out before quoting.
    await api(sup, '/api/supplier/decline-work', { ticketId, reason: 'Outside our service area' })
    const invite = await getInvite(ticketId, fx.supplierAId)
    expect(invite.status, 'A invite declined').toBe('declined')
    expect(invite.declined_by, 'declined by the supplier').toBe('supplier')
    // A durable "declined the request" row is kept for the audit trail.
    const { count: declineRows } = await admin.from('ticket_supplier_declines')
      .select('id', { count: 'exact', head: true }).eq('ticket_id', ticketId).eq('supplier_id', fx.supplierAId)
    expect(declineRows, 'a ticket_supplier_declines row was written').toBe(1)
    // With every invited supplier out, the ticket returns to 'open' for re-assignment.
    await expectTicketStatus(ticketId, 'open', 'ticket reopens after the only supplier declines')

    // RM re-assigns supplier B, who takes it through to completion.
    await api(rm, `/api/tickets/${ticketId}/assign`, { supplierIds: [fx.supplierBId] })
    await api(supB, `/api/tickets/${ticketId}/submit-quote`, { amount: 3200, description: 'e2e supplier B quote' })
    const qB = await quoteFor(ticketId, fx.supplierBId)
    await api(rm, `/api/tickets/${ticketId}/quote-decision`, { action: 'approve', quoteId: qB.id })
    expect((await getTicket(ticketId)).supplier_id, 'awarded to B after A declined').toBe(fx.supplierBId)
    await transition(supB, ticketId, 'start_work', {}, 'in_progress')
    await transition(supB, ticketId, 'submit_completion', { notes: 'e2e B completion' }, 'submitted_for_signoff')
    await transition(rm, ticketId, 'approve', {}, 'approved_closeout')
    // Close-out via B.
    await apiExpectStatus(rm, `/api/tickets/${ticketId}/transition`, { action: 'close_out' }, 409)
    await api(supB, '/api/supplier/ticket-action', { ticketId, action: 'confirm_no_vos' })
    await transition(rm, ticketId, 'close_out', {}, 'completed')
  })

  test('info request: RM asks for more info; SM attaches a document and resubmits; flow continues', async () => {
    test.setTimeout(240_000)
    const ticketId = await createTicket('info-request')

    // RM sends it back to the store for more information.
    await transition(rm, ticketId, 'request_info', { reason: 'e2e: which floor is the leak on?' }, 'info_requested')

    // SM uploads a supporting document and attaches it, then resubmits. The PATCH
    // route is the shared "edit ticket" endpoint — it requires the full ticket body
    // (title + description), exactly as the AddInfoModal sends it.
    const infoDoc = await uploadFile(sm, 'ticket-docs', 'floor-plan.pdf', 'application/pdf', PDF_MIN)
    const { data: cur } = await admin.from('tickets').select('title, description, category, operational_impact').eq('id', ticketId).single()
    await patchTicket(sm, ticketId, {
      title: cur!.title, description: cur!.description ?? 'e2e info',
      category: cur!.category, operational_impact: cur!.operational_impact,
      info_doc_urls: [infoDoc],
    })
    await transition(sm, ticketId, 'resubmit', {}, 'open')

    const { data: withInfo } = await admin.from('tickets')
      .select('info_added_at, info_doc_urls').eq('id', ticketId).single()
    expect(withInfo?.info_added_at, 'info_added_at stamped on resubmit').toBeTruthy()
    expect(withInfo?.info_doc_urls, 'attached info document persisted').toContain(infoDoc)

    // The document is a viewable attachment — the RM opening it is recorded once.
    await recordView(rm, ticketId, 'attachment', 'Ticket document 1')
    expect(await viewCount(ticketId, 'attachment', 'Ticket document 1'), 'RM view recorded').toBe(1)
    await recordView(rm, ticketId, 'attachment', 'Ticket document 1')
    expect(await viewCount(ticketId, 'attachment', 'Ticket document 1'), 'duplicate view is a no-op (first-view-wins)').toBe(1)

    // The ticket carries on through the normal lifecycle.
    await driveToSignoff(ticketId, 1500)
    await transition(rm, ticketId, 'approve', {}, 'approved_closeout')
    await closeOut(ticketId)
  })

  test('attachments + view-tracking: quote PDF uploaded, carried on the quote, and its view is audited', async () => {
    test.setTimeout(240_000)
    const ticketId = await createTicket('attachments')

    await api(rm, `/api/tickets/${ticketId}/assign`, { supplierIds: [fx.supplierAId] })

    // Supplier uploads a quote PDF and a completion photo through the real route.
    const quotePdf = await uploadFile(sup, 'quote-attachments', 'quote.pdf', 'application/pdf', PDF_MIN)
    await api(sup, `/api/tickets/${ticketId}/submit-quote`, { amount: 1800, description: 'e2e quote with attachment', file_url: quotePdf })
    const quote = await quoteFor(ticketId, fx.supplierAId)
    expect(quote.file_url, 'uploaded PDF is stored on the quote row').toBe(quotePdf)

    // RM opens the quote attachment — recorded once, deduped on repeat.
    await recordView(rm, ticketId, 'quote', 'quote attachment')
    expect(await viewCount(ticketId, 'quote', 'quote attachment'), 'quote attachment view recorded').toBe(1)
    await recordView(rm, ticketId, 'quote', 'quote attachment')
    expect(await viewCount(ticketId, 'quote', 'quote attachment'), 'quote view deduped').toBe(1)

    await api(rm, `/api/tickets/${ticketId}/quote-decision`, { action: 'approve', quoteId: quote.id })
    await transition(sup, ticketId, 'start_work', {}, 'in_progress')

    // A completion photo + COC uploaded as evidence before sign-off.
    const afterPhoto = await uploadFile(sup, 'ticket-photos', 'after.png', 'image/png', PNG_1x1)
    await api(sup, '/api/supplier/ticket-action', { ticketId, action: 'add_evidence', kind: 'after_photo', url: afterPhoto })
    const cocPdf = await uploadFile(sup, 'completion-docs', 'coc.pdf', 'application/pdf', PDF_MIN)
    await api(sup, '/api/supplier/ticket-action', { ticketId, action: 'add_evidence', kind: 'coc', url: cocPdf })
    const { count: evidenceRows } = await admin.from('ticket_evidence')
      .select('id', { count: 'exact', head: true }).eq('ticket_id', ticketId)
    expect(evidenceRows, 'two evidence rows (after photo + COC)').toBe(2)
    const { data: flagged } = await admin.from('tickets')
      .select('after_photo_uploaded, completion_certificate_uploaded').eq('id', ticketId).single()
    expect(flagged?.after_photo_uploaded, 'after-photo flag set').toBe(true)
    expect(flagged?.completion_certificate_uploaded, 'COC flag set').toBe(true)

    await transition(sup, ticketId, 'submit_completion', { notes: 'e2e attachments completion' }, 'submitted_for_signoff')
    // RM opens the COC on the submission — audited too.
    await recordView(rm, ticketId, 'coc', 'Completion COC')
    expect(await viewCount(ticketId, 'coc', 'Completion COC'), 'COC view recorded').toBe(1)
    await transition(rm, ticketId, 'approve', {}, 'approved_closeout')
    await closeOut(ticketId)
  })

  test('variation order: supplier raises a VO with a document; RM views it and approves', async () => {
    test.setTimeout(240_000)
    const ticketId = await createTicket('variation-approve')

    await driveToSignoff(ticketId, 2200)
    await transition(rm, ticketId, 'approve', {}, 'approved_closeout')

    // Supplier raises a VO (extra work) with excl + incl VAT and a supporting doc.
    const voDoc = await uploadFile(sup, 'quote-attachments', 'vo.pdf', 'application/pdf', PDF_MIN)
    await transition(sup, ticketId, 'submit_variation',
      { description: 'e2e VO: replace damaged valve + second pressure test', amount: 100, amount_incl_vat: 115, fileUrls: [voDoc] },
      'variation_review')
    let vo = await latestVariation(ticketId)
    expect(vo.status, 'VO pending').toBe('pending')
    expect(Number(vo.amount), 'VO excl VAT').toBe(100)
    expect(Number(vo.amount_incl_vat), 'VO incl VAT').toBe(115)
    expect(vo.file_urls, 'VO supporting doc attached').toContain(voDoc)

    // RM opens the VO attachment (audited), then approves the VO.
    await recordView(rm, ticketId, 'attachment', 'Variation order 1 attachment 1')
    expect(await viewCount(ticketId, 'attachment', 'Variation order 1 attachment 1'), 'VO attachment view recorded').toBe(1)
    await transition(rm, ticketId, 'approve_variation', {}, 'approved_closeout')
    vo = await latestVariation(ticketId)
    expect(vo.status, 'VO approved').toBe('approved')

    await closeOut(ticketId)
  })

  test('variation order declined → re-submit → approve', async () => {
    test.setTimeout(240_000)
    const ticketId = await createTicket('variation-decline')

    await driveToSignoff(ticketId, 2600)
    await transition(rm, ticketId, 'approve', {}, 'approved_closeout')

    // First VO is declined with a reason.
    await transition(sup, ticketId, 'submit_variation', { description: 'e2e VO first attempt', amount: 900 }, 'variation_review')
    await transition(rm, ticketId, 'reject_variation', { reason: 'Cost too high' }, 'vo_declined')
    let vo = await latestVariation(ticketId)
    expect(vo.status, 'first VO rejected').toBe('rejected')
    expect(vo.reject_reason, 'decline reason stored').toBe('Cost too high')

    // Supplier revises + re-submits; RM approves this one.
    await transition(sup, ticketId, 'submit_variation', { description: 'e2e VO revised', amount: 500, amount_incl_vat: 575 }, 'variation_review')
    vo = await latestVariation(ticketId)
    expect(vo.status, 'revised VO pending').toBe('pending')
    expect(Number(vo.amount), 'revised VO amount').toBe(500)
    await transition(rm, ticketId, 'approve_variation', {}, 'approved_closeout')
    expect((await latestVariation(ticketId)).status, 'revised VO approved').toBe('approved')

    await closeOut(ticketId)
  })

  test('variation dispute: supplier disputes a declined VO; RM resolves and it reopens', async () => {
    test.setTimeout(240_000)
    const ticketId = await createTicket('vo-dispute')

    await driveToSignoff(ticketId, 2400)
    await transition(rm, ticketId, 'approve', {}, 'approved_closeout')
    await transition(sup, ticketId, 'submit_variation', { description: 'e2e VO to be disputed', amount: 800 }, 'variation_review')
    await transition(rm, ticketId, 'reject_variation', { reason: 'Not budgeted' }, 'vo_declined')

    // Supplier disputes the VO decline (origin 'variation', bound to their org).
    await api(sup, `/api/tickets/${ticketId}/dispute`, { action: 'raise', body: 'e2e: this variation was pre-approved on site' })
    const { data: open } = await admin.from('ticket_disputes')
      .select('id, status, origin, supplier_id').eq('ticket_id', ticketId).eq('status', 'open').maybeSingle()
    expect(open, 'an open dispute exists').toBeTruthy()
    expect(open?.origin, 'dispute origin is variation').toBe('variation')
    expect(open?.supplier_id, 'dispute bound to supplier A org').toBe(fx.supplierAId)

    // A second raise while one is open is rejected (409).
    await apiExpectStatus(sup, `/api/tickets/${ticketId}/dispute`, { action: 'raise', body: 'e2e dup' }, 409)

    // Both sides post to the thread.
    await api(rm, `/api/tickets/${ticketId}/dispute`, { action: 'reply', body: 'e2e: reviewing the on-site note' })
    const { count: msgs } = await admin.from('ticket_dispute_messages')
      .select('id', { count: 'exact', head: true }).eq('dispute_id', open!.id)
    expect(msgs, 'raise message + RM reply on the thread').toBe(2)

    // RM resolves by retracting the decline (outcome withdrawn).
    await api(rm, `/api/tickets/${ticketId}/dispute`, { action: 'retract', note: 'e2e: agreed — reopening the VO' })
    const { data: resolved } = await admin.from('ticket_disputes')
      .select('status, outcome, resolved_at').eq('id', open!.id).single()
    expect(resolved?.status, 'dispute resolved').toBe('resolved')
    expect(resolved?.outcome, 'RM retraction outcome').toBe('withdrawn')
    expect(resolved?.resolved_at, 'resolved_at stamped').toBeTruthy()
  })

  test('snag reschedule: RM declines the proposed fix date; supplier re-proposes; then fixes', async () => {
    test.setTimeout(240_000)
    const ticketId = await createTicket('snag-reschedule')

    await driveToSignoff(ticketId, 2700)
    await transition(rm, ticketId, 'raise_snag', { description: 'e2e snag: sealant missing', severity: 'minor' }, 'snag')

    // Supplier proposes a fix date; RM declines it (asks for a different slot).
    const firstDate = new Date(Date.now() + 24 * 3600_000).toISOString()
    await transition(sup, ticketId, 'accept_snag', { scheduledAt: firstDate }, 'snag_assigned')
    await transition(rm, ticketId, 'decline_snag_schedule', { reason: 'e2e: please pick a morning slot' }, 'snag')
    const declinedSnag = await latestSnag(ticketId)
    expect(declinedSnag.schedule_status, 'schedule marked declined').toBe('declined')
    expect(declinedSnag.scheduled_at, 'the declined proposed date survives on the row').toBeTruthy()

    // Supplier re-proposes; RM approves; the fix proceeds to sign-off + close-out.
    const secondDate = new Date(Date.now() + 48 * 3600_000).toISOString()
    await transition(sup, ticketId, 'accept_snag', { scheduledAt: secondDate }, 'snag_assigned')
    expect((await latestSnag(ticketId)).schedule_status, 're-proposed date awaiting RM').toBe('proposed')
    await transition(rm, ticketId, 'approve_snag', {}, 'snag_assigned')
    expect((await latestSnag(ticketId)).schedule_status, 'schedule agreed').toBe('agreed')
    await transition(sup, ticketId, 'start_snag', {}, 'snag_in_progress')
    await transition(sup, ticketId, 'submit_completion', { notes: 'e2e reschedule fixed' }, 'submitted_for_signoff')
    await transition(rm, ticketId, 'approve', {}, 'approved_closeout')
    await closeOut(ticketId)
  })
})
