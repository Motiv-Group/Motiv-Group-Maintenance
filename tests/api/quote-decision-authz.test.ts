import { describe, it, expect, beforeEach, vi } from 'vitest'
import { jsonRequest } from '../helpers/supabase-mock'

// ---------------------------------------------------------------------------
// Integration authZ tests for POST /api/tickets/[id]/quote-decision — the RM
// (or executive / individual owner) approving, declining, or re-requesting a
// supplier's quote.
//
// Supabase is mocked so no DB is required — each table returns a fixed fixture
// (the handler authorizes on the ROWS a table yields, not on the filter).
// Business rules under test:
//   • only regional_manager / executive / individual may decide (supplier and
//     store_manager → 403)
//   • the quote must still be pending — approving/declining an already-decided
//     quote → 409 (idempotency / no double-award)
//   • approve vs decline vs requote paths
//   • an individual can only decide on their own created_by ticket
//   • cross-company access → 404 (existence not leaked)
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
import { POST } from '@/app/api/tickets/[id]/quote-decision/route'

const RM = 'user-rm'
const OWNER = 'user-owner'
const OTHER = 'user-other'
// Next 16: route handlers receive params as a Promise (awaited in the handler).
const params = { params: Promise.resolve({ id: 'ticket-1' }) }

const approve = { action: 'approve', quoteId: 'quote-1' }
const decline = { action: 'decline', quoteId: 'quote-1', reason: 'Too expensive' }
const requote = { action: 'requote', quoteId: 'quote-1' }

/** Seed the mock: caller + profile + ticket + quote + link tables. */
function seed(opts: {
  user?: string | null
  profile?: Record<string, any> | null
  ticket?: Record<string, any> | null
  quote?: Record<string, any> | null
  tables?: Record<string, { rows?: any[]; error?: any }>
}) {
  H.state.user = opts.user === undefined ? { id: RM } : (opts.user === null ? null : { id: opts.user })
  H.state.tables = {
    user_profiles: {
      rows: opts.profile === null ? [] : [opts.profile ?? { role: 'regional_manager', company_id: 'company-A', full_name: 'RM' }],
    },
    tickets: {
      rows: opts.ticket === null ? [] : [opts.ticket ?? {
        id: 'ticket-1', company_id: 'company-A', region_id: 'region-1', store_id: 's1',
        created_by: OWNER, title: 'Broken door', status: 'quoted', priority: 'P3', quote_value: 100,
      }],
    },
    quotes: {
      rows: opts.quote === null ? [] : [opts.quote ?? { id: 'quote-1', supplier_id: 'sup-1', status: 'pending', proposed_schedule_at: null }],
    },
    // RM is linked to the ticket's region by default (rmOwnsTicket passes).
    regional_users: { rows: [{ region_id: 'region-1' }] },
    stores: { rows: [] },
    supplier_users: { rows: [] },
    ticket_suppliers: { rows: [] },
    notifications: { rows: [] },
    ticket_quote_requests: { rows: [] },
    ...opts.tables,
  }
}

beforeEach(() => { H.state.user = null; H.state.tables = {} })

// ===========================================================================
// Authentication + body validation
// ===========================================================================
describe('POST /api/tickets/[id]/quote-decision — auth + input', () => {
  it('401 when unauthenticated', async () => {
    seed({ user: null })
    const res = await POST(jsonRequest(approve), params)
    expect(res.status).toBe(401)
  })

  it('400 when quoteId is missing', async () => {
    seed({})
    const res = await POST(jsonRequest({ action: 'approve' }), params)
    expect(res.status).toBe(400)
  })

  it('400 when action is missing', async () => {
    seed({})
    const res = await POST(jsonRequest({ quoteId: 'quote-1' }), params)
    expect(res.status).toBe(400)
  })

  it('400 when action is not approve/decline/requote', async () => {
    seed({})
    const res = await POST(jsonRequest({ action: 'nonsense', quoteId: 'quote-1' }), params)
    expect(res.status).toBe(400)
  })
})

// ===========================================================================
// Role gate — only regional_manager / executive / individual may decide
// ===========================================================================
describe('POST /api/tickets/[id]/quote-decision — role gate', () => {
  it('supplier → 403 (suppliers never decide quotes)', async () => {
    seed({ profile: { role: 'supplier', company_id: 'company-A' } })
    const res = await POST(jsonRequest(approve), params)
    expect(res.status).toBe(403)
  })

  it('store_manager → 403 (store side cannot decide quotes)', async () => {
    seed({ profile: { role: 'store_manager', company_id: 'company-A' } })
    const res = await POST(jsonRequest(approve), params)
    expect(res.status).toBe(403)
  })

  it('regional_manager with no company_id → 403', async () => {
    seed({ profile: { role: 'regional_manager', company_id: null } })
    const res = await POST(jsonRequest(approve), params)
    expect(res.status).toBe(403)
  })

  it('no profile row at all → 403', async () => {
    seed({ profile: null })
    const res = await POST(jsonRequest(approve), params)
    expect(res.status).toBe(403)
  })
})

// ===========================================================================
// Tenant + ownership isolation
// ===========================================================================
describe('POST /api/tickets/[id]/quote-decision — tenant/ownership', () => {
  it('ticket does not exist → 404', async () => {
    seed({ ticket: null })
    const res = await POST(jsonRequest(approve), params)
    expect(res.status).toBe(404)
  })

  it("executive on a DIFFERENT company's ticket → 404 (existence not leaked)", async () => {
    seed({
      profile: { role: 'executive', company_id: 'company-A' },
      ticket: { id: 'ticket-1', company_id: 'company-B', region_id: 'region-1', created_by: OWNER, title: 'Broken door', status: 'quoted', priority: 'P3' },
    })
    const res = await POST(jsonRequest(approve), params)
    expect(res.status).toBe(404)
  })

  it('regional_manager in the right company but NOT linked to the ticket region → 403', async () => {
    seed({
      // No regional_users link and no store fallback → rmOwnsTicket denies.
      tables: { regional_users: { rows: [] }, stores: { rows: [] } },
    })
    const res = await POST(jsonRequest(approve), params)
    expect(res.status).toBe(403)
  })

  it('individual deciding on someone ELSE\'s ticket → 403', async () => {
    seed({
      user: OTHER,
      profile: { role: 'individual', company_id: null },
      ticket: { id: 'ticket-1', company_id: null, region_id: null, store_id: null, created_by: OWNER, title: 'Broken door', status: 'quoted', priority: 'P3' },
    })
    const res = await POST(jsonRequest(approve), params)
    expect(res.status).toBe(403)
  })

  it('quote does not exist on this ticket → 404', async () => {
    seed({ quote: null })
    const res = await POST(jsonRequest(approve), params)
    expect(res.status).toBe(404)
  })
})

// ===========================================================================
// Idempotency — approve/decline only act on a still-pending quote
// ===========================================================================
describe('POST /api/tickets/[id]/quote-decision — idempotency (409 on decided quotes)', () => {
  it('approving an already-accepted quote → 409 (no double-award)', async () => {
    seed({ quote: { id: 'quote-1', supplier_id: 'sup-1', status: 'accepted', proposed_schedule_at: null } })
    const res = await POST(jsonRequest(approve), params)
    expect(res.status).toBe(409)
  })

  it('approving an already-declined quote → 409', async () => {
    seed({ quote: { id: 'quote-1', supplier_id: 'sup-1', status: 'declined', proposed_schedule_at: null } })
    const res = await POST(jsonRequest(approve), params)
    expect(res.status).toBe(409)
  })

  it('declining an already-declined quote → 409 (no duplicate notifications)', async () => {
    seed({ quote: { id: 'quote-1', supplier_id: 'sup-1', status: 'declined', proposed_schedule_at: null } })
    const res = await POST(jsonRequest(decline), params)
    expect(res.status).toBe(409)
  })

  it('requote IS allowed on a declined quote (acts on it intentionally) → 200', async () => {
    seed({ quote: { id: 'quote-1', supplier_id: 'sup-1', status: 'declined', proposed_schedule_at: null } })
    const res = await POST(jsonRequest(requote), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })
})

// ===========================================================================
// Happy paths per allowed role
// ===========================================================================
describe('POST /api/tickets/[id]/quote-decision — happy paths', () => {
  it('regional_manager (region-linked) approving a pending quote → 200', async () => {
    seed({})
    const res = await POST(jsonRequest(approve), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it('regional_manager declining a pending quote (with reason) → 200', async () => {
    seed({})
    const res = await POST(jsonRequest(decline), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it('executive (same company) approving a pending quote → 200 (no region link required)', async () => {
    seed({
      profile: { role: 'executive', company_id: 'company-A' },
      tables: { regional_users: { rows: [] } },
    })
    const res = await POST(jsonRequest(approve), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it('individual owner approving a quote on their standalone ticket → 200', async () => {
    seed({
      user: OWNER,
      profile: { role: 'individual', company_id: null },
      ticket: { id: 'ticket-1', company_id: null, region_id: null, store_id: null, created_by: OWNER, title: 'Broken door', status: 'quoted', priority: 'P3' },
    })
    const res = await POST(jsonRequest(approve), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it('individual owner declining a quote on their own ticket → 200', async () => {
    seed({
      user: OWNER,
      profile: { role: 'individual', company_id: null },
      ticket: { id: 'ticket-1', company_id: null, region_id: null, store_id: null, created_by: OWNER, title: 'Broken door', status: 'quoted', priority: 'P3' },
    })
    const res = await POST(jsonRequest(decline), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })
})
