import { describe, it, expect, beforeEach, vi } from 'vitest'
import { jsonRequest } from '../helpers/supabase-mock'

// ---------------------------------------------------------------------------
// Integration authZ tests for the three ticket write-handlers touched in
// cdc7dec ("let Individuals run their ticket workflow"):
//   • PATCH  /api/tickets/[id]            (edit)
//   • DELETE /api/tickets/[id]            (delete)
//   • POST   /api/tickets/[id]/transition (lifecycle move)
//
// Supabase is mocked so no DB is required — each table returns a fixed fixture
// (the handlers authorize on the ROWS a table yields, not on the filter). The
// regression these guard against: an Individual owns a company-less standalone
// ticket and must NOT be 403'd, while cross-company access must still 404.
// ---------------------------------------------------------------------------

// State + builder live in vi.hoisted so the (hoisted) vi.mock factory can reach
// them — a normal import isn't initialised when the factory first runs.
const H = vi.hoisted(() => {
  const state: { user: any; tables: Record<string, { rows?: any[]; error?: any }> } = {
    user: null,
    tables: {},
  }
  const CHAIN = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'in', 'ilike', 'like', 'is', 'not',
    'gt', 'gte', 'lt', 'lte', 'contains', 'or', 'filter',
    'order', 'limit', 'range',
  ]
  function builder(table: string) {
    const conf = state.tables[table] ?? {}
    const rows = conf.rows ?? []
    const error = conf.error ?? null
    const b: any = {}
    const chain = () => b
    for (const m of CHAIN) b[m] = chain
    b.single = () => Promise.resolve({ data: rows[0] ?? null, error })
    b.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error })
    b.then = (resolve: any, reject: any) =>
      Promise.resolve({ data: rows, error, count: rows.length }).then(resolve, reject)
    return b
  }
  const admin = { from: (t: string) => builder(t) }
  const client = {
    from: (t: string) => builder(t),
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  }
  return { state, admin, client }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => H.client,
  createAdminClient: () => H.admin,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => true }))
vi.mock('@/lib/push', () => ({ sendPushToMany: () => {}, sendPushToUser: () => {} }))
vi.mock('@/lib/health/data', () => ({
  loadSlaResolver: async () => () => ({
    quote_due_mins: 60, internal_decision_mins: 60, first_response_mins: 60,
    attendance_mins: 60, resolution_mins: 60,
  }),
}))

// Imported AFTER the mocks (vi.mock is hoisted above these imports).
import { PATCH, DELETE } from '@/app/api/tickets/[id]/route'
import { POST as TRANSITION } from '@/app/api/tickets/[id]/transition/route'

const OWNER = 'user-owner'
const OTHER = 'user-other'
const params = { params: { id: 'ticket-1' } }

/** Seed the mock: caller profile + the ticket + any link tables. */
function seed(opts: {
  user?: string | null
  profile?: Record<string, any> | null
  ticket?: Record<string, any> | null
  tables?: Record<string, { rows?: any[]; error?: any }>
}) {
  H.state.user = opts.user === undefined ? { id: OWNER } : (opts.user === null ? null : { id: opts.user })
  H.state.tables = {
    user_profiles: { rows: opts.profile === null ? [] : [opts.profile ?? { role: 'individual', company_id: null }] },
    tickets: { rows: opts.ticket === null ? [] : [opts.ticket ?? {}] },
    // Empty link tables by default (no region/store/supplier membership).
    regional_users: { rows: [] },
    store_users: { rows: [] },
    supplier_users: { rows: [] },
    ticket_suppliers: { rows: [] },
    quotes: { rows: [] },
    notifications: { rows: [] },
    ticket_disputes: { rows: [] },
    ...opts.tables,
  }
}

beforeEach(() => { H.state.user = null; H.state.tables = {} })

// ===========================================================================
// PATCH /api/tickets/[id] — edit
// ===========================================================================
describe('PATCH /api/tickets/[id] — edit authZ', () => {
  const editBody = { title: 'Leak', description: 'Tap dripping', operational_impact: 'none' }

  it('401 when unauthenticated', async () => {
    seed({ user: null })
    const res = await PATCH(jsonRequest(editBody, 'PATCH'), params)
    expect(res.status).toBe(401)
  })

  it('individual owner editing their open standalone ticket → 200', async () => {
    seed({
      profile: { role: 'individual', company_id: null },
      ticket: { created_by: OWNER, company_id: null, store_id: null, region_id: null, status: 'open' },
    })
    const res = await PATCH(jsonRequest(editBody, 'PATCH'), params)
    expect(res.status).toBe(200)
  })

  it('individual who is NOT the owner → 404 (not their ticket)', async () => {
    seed({
      profile: { role: 'individual', company_id: null },
      ticket: { created_by: OTHER, company_id: null, store_id: null, region_id: null, status: 'open' },
    })
    const res = await PATCH(jsonRequest(editBody, 'PATCH'), params)
    expect(res.status).toBe(404)
  })

  it('store manager editing a DIFFERENT company ticket → 404 (tenant isolation)', async () => {
    seed({
      profile: { role: 'store_manager', company_id: 'company-A' },
      ticket: { created_by: OWNER, company_id: 'company-B', store_id: 's1', region_id: null, status: 'open' },
    })
    const res = await PATCH(jsonRequest(editBody, 'PATCH'), params)
    expect(res.status).toBe(404)
  })

  it('supplier (same company, not owner) cannot edit → 403', async () => {
    seed({
      profile: { role: 'supplier', company_id: 'company-A' },
      ticket: { created_by: OTHER, company_id: 'company-A', store_id: 's1', region_id: null, status: 'open' },
    })
    const res = await PATCH(jsonRequest(editBody, 'PATCH'), params)
    expect(res.status).toBe(403)
  })

  it('owner but ticket no longer open → 400', async () => {
    seed({
      profile: { role: 'individual', company_id: null },
      ticket: { created_by: OWNER, company_id: null, store_id: null, region_id: null, status: 'accepted' },
    })
    const res = await PATCH(jsonRequest(editBody, 'PATCH'), params)
    expect(res.status).toBe(400)
  })
})

// ===========================================================================
// DELETE /api/tickets/[id] — delete
// ===========================================================================
describe('DELETE /api/tickets/[id] — delete authZ', () => {
  it('401 when unauthenticated', async () => {
    seed({ user: null })
    const res = await DELETE(jsonRequest(undefined, 'DELETE'), params)
    expect(res.status).toBe(401)
  })

  it('individual owner deleting their open standalone ticket → 200', async () => {
    seed({
      profile: { role: 'individual', company_id: null },
      ticket: { created_by: OWNER, company_id: null, store_id: null, status: 'open' },
    })
    const res = await DELETE(jsonRequest(undefined, 'DELETE'), params)
    expect(res.status).toBe(200)
  })

  it('individual non-owner → 404', async () => {
    seed({
      profile: { role: 'individual', company_id: null },
      ticket: { created_by: OTHER, company_id: null, store_id: null, status: 'open' },
    })
    const res = await DELETE(jsonRequest(undefined, 'DELETE'), params)
    expect(res.status).toBe(404)
  })

  it('store manager deleting a different-company ticket → 404', async () => {
    seed({
      profile: { role: 'store_manager', company_id: 'company-A' },
      ticket: { created_by: OWNER, company_id: 'company-B', store_id: 's1', status: 'open' },
    })
    const res = await DELETE(jsonRequest(undefined, 'DELETE'), params)
    expect(res.status).toBe(404)
  })

  it('owner but ticket not open → 400', async () => {
    seed({
      profile: { role: 'individual', company_id: null },
      ticket: { created_by: OWNER, company_id: null, store_id: null, status: 'in_progress' },
    })
    const res = await DELETE(jsonRequest(undefined, 'DELETE'), params)
    expect(res.status).toBe(400)
  })
})

// ===========================================================================
// POST /api/tickets/[id]/transition — lifecycle move
// ===========================================================================
describe('POST /api/tickets/[id]/transition — authZ', () => {
  // 'quoted' + 'approve_quote' is a valid move for individual/regional/executive.
  const approve = { action: 'approve_quote' }

  it('401 when unauthenticated', async () => {
    seed({ user: null })
    const res = await TRANSITION(jsonRequest(approve), params)
    expect(res.status).toBe(401)
  })

  it('non-individual with no company → 403', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: null },
      ticket: { id: 'ticket-1', created_by: OWNER, company_id: null, status: 'quoted', priority: 'P3' },
    })
    const res = await TRANSITION(jsonRequest(approve), params)
    expect(res.status).toBe(403)
  })

  it('individual owner approving a quote on their standalone ticket → 200 (the cdc7dec regression)', async () => {
    seed({
      profile: { role: 'individual', company_id: null },
      ticket: { id: 'ticket-1', created_by: OWNER, company_id: null, region_id: null, store_id: null, supplier_id: null, status: 'quoted', priority: 'P3' },
    })
    const res = await TRANSITION(jsonRequest(approve), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, status: 'accepted' })
  })

  it('individual who is NOT the owner → 403 (hasAccess denies)', async () => {
    seed({
      profile: { role: 'individual', company_id: null },
      ticket: { id: 'ticket-1', created_by: OTHER, company_id: null, region_id: null, store_id: null, status: 'quoted', priority: 'P3' },
    })
    const res = await TRANSITION(jsonRequest(approve), params)
    expect(res.status).toBe(403)
  })

  it('store manager on a different-company ticket → 404 (tenant isolation)', async () => {
    seed({
      profile: { role: 'store_manager', company_id: 'company-A' },
      ticket: { id: 'ticket-1', created_by: OWNER, company_id: 'company-B', store_id: 's1', status: 'quoted', priority: 'P3' },
    })
    const res = await TRANSITION(jsonRequest(approve), params)
    expect(res.status).toBe(404)
  })

  it('supplier with no link to the ticket → 403', async () => {
    seed({
      profile: { role: 'supplier', company_id: null },
      ticket: { id: 'ticket-1', created_by: OWNER, company_id: null, supplier_id: 'sup-9', status: 'quoted', priority: 'P3' },
      // supplier_users + ticket_suppliers stay empty → not their ticket.
    })
    const res = await TRANSITION(jsonRequest(approve), params)
    expect(res.status).toBe(403)
  })

  it('unknown action on a valid ticket → 400 (no transition)', async () => {
    seed({
      profile: { role: 'individual', company_id: null },
      ticket: { id: 'ticket-1', created_by: OWNER, company_id: null, region_id: null, store_id: null, status: 'quoted', priority: 'P3' },
    })
    const res = await TRANSITION(jsonRequest({ action: 'nonsense' }), params)
    expect(res.status).toBe(400)
  })
})
