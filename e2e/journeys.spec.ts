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

  let sm: APIRequestContext // store manager
  let rm: APIRequestContext // regional manager
  let sup: APIRequestContext // supplier A user
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
      await admin.from('ticket_quote_requests').delete().in('ticket_id', createdTicketIds)
      await admin.from('ticket_updates').delete().in('ticket_id', createdTicketIds)
      await admin.from('ticket_suppliers').delete().in('ticket_id', createdTicketIds)
      await admin.from('quotes').delete().in('ticket_id', createdTicketIds)
      await admin.from('tickets').delete().in('id', createdTicketIds)
    }
    await Promise.all([sm, rm, sup].map(c => c?.dispose()))
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
})
