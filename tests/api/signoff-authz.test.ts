import { describe, it, expect, beforeEach, vi } from 'vitest'
import { jsonRequest } from '../helpers/supabase-mock'

// ---------------------------------------------------------------------------
// Integration authZ tests for GET /api/tickets/[id]/signoff — the RM-scoped
// "Sign off" pop-up feed (the submission currently under review: proof photos,
// COC, invoice, notes).
//
// This route is GET-only: only a regional_manager may REVIEW a signoff, and
// only for a ticket in their own company AND one of their regions (via
// lib/rm-ticket-access.ts rmOwnsTicket — region_id match, falling back to the
// ticket's store's region). Signoff SUBMISSION is not handled here (no POST on
// this route), so submit-side rules live with the transition tests. There is
// no request body on GET, so no 400-invalid-body case exists for this handler.
//
// Supabase is mocked so no DB is required — each table returns a fixed fixture
// regardless of filters (the handler authorizes on the ROWS a table yields).
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
// Storage signing is a side-effect module (hits Supabase Storage) — stub it so
// signed URLs are deterministic ("signed:<stored>") and nulls stay null.
vi.mock('@/lib/storage', () => ({
  signedUrl: async (u: string | null | undefined) => (u ? `signed:${u}` : null),
}))

// Imported AFTER the mocks (vi.mock is hoisted above these imports).
import { GET } from '@/app/api/tickets/[id]/signoff/route'

const RM = 'user-rm'
// Next 16: route handlers receive params as a Promise (awaited in the handler).
const params = { params: Promise.resolve({ id: 'ticket-1' }) }

const TICKET = {
  id: 'ticket-1',
  company_id: 'company-A',
  region_id: 'region-1',
  store_id: 'store-1',
  status: 'pending_sign_off',
}

/** Seed the mock: caller + profile + the ticket + any link/data tables. */
function seed(opts: {
  user?: string | null
  profile?: Record<string, any> | null
  ticket?: Record<string, any> | null
  tables?: Record<string, { rows?: any[]; error?: any }>
}) {
  H.state.user = opts.user === undefined ? { id: RM } : (opts.user === null ? null : { id: opts.user })
  H.state.tables = {
    user_profiles: { rows: opts.profile === null ? [] : [opts.profile ?? { role: 'regional_manager', company_id: 'company-A' }] },
    tickets: { rows: opts.ticket === null ? [] : [opts.ticket ?? TICKET] },
    // Empty by default: no region membership, no store lookup, no submissions.
    regional_users: { rows: [] },
    stores: { rows: [] },
    signoffs: { rows: [] },
    supplier_users: { rows: [] },
    ticket_suppliers: { rows: [] },
    ...opts.tables,
  }
}

const get = () => GET(jsonRequest(undefined, 'GET'), params)

beforeEach(() => { H.state.user = null; H.state.tables = {} })

// ===========================================================================
// Authentication + role gate (only regional_manager may review a signoff)
// ===========================================================================
describe('GET /api/tickets/[id]/signoff — auth + role gate', () => {
  it('401 when unauthenticated', async () => {
    seed({ user: null })
    const res = await get()
    expect(res.status).toBe(401)
  })

  it('403 when the caller has no profile row', async () => {
    seed({ profile: null })
    const res = await get()
    expect(res.status).toBe(403)
  })

  const deniedRoles = ['store_manager', 'executive', 'individual', 'system_admin', 'client']
  for (const role of deniedRoles) {
    it(`403 for role "${role}" — only regional managers review signoffs`, async () => {
      seed({ profile: { role, company_id: 'company-A' } })
      const res = await get()
      expect(res.status).toBe(403)
    })
  }

  it('403 for a supplier even when linked (supplier_users) and awarded/invited (ticket_suppliers) — suppliers submit, they never review', async () => {
    seed({
      profile: { role: 'supplier', company_id: 'company-A' },
      tables: {
        supplier_users: { rows: [{ user_id: RM, supplier_id: 'sup-1' }] },
        ticket_suppliers: { rows: [{ ticket_id: 'ticket-1', supplier_id: 'sup-1', status: 'awarded' }] },
      },
    })
    const res = await get()
    expect(res.status).toBe(403)
  })
})

// ===========================================================================
// Tenant isolation (404 — existence never leaked)
// ===========================================================================
describe('GET /api/tickets/[id]/signoff — tenant isolation', () => {
  it('404 when the ticket does not exist', async () => {
    seed({ ticket: null })
    const res = await get()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
  })

  it('404 for a DIFFERENT-company ticket — identical body to not-found (no existence leak)', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'company-A' },
      ticket: { ...TICKET, company_id: 'company-B' },
      // Even with region membership that would otherwise match:
      tables: { regional_users: { rows: [{ region_id: 'region-1' }] } },
    })
    const res = await get()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
  })
})

// ===========================================================================
// Region ownership (right role, wrong owner → 403)
// ===========================================================================
describe('GET /api/tickets/[id]/signoff — RM must own the region/store', () => {
  it('403 for an RM with NO regional_users membership at all', async () => {
    seed({}) // default RM profile + same-company ticket, regional_users empty
    const res = await get()
    expect(res.status).toBe(403)
  })

  it("403 for an RM whose regions match neither the ticket's region nor its store's region", async () => {
    seed({
      ticket: { ...TICKET, region_id: 'region-9' },
      tables: {
        regional_users: { rows: [{ region_id: 'region-1' }, { region_id: 'region-2' }] },
        stores: { rows: [{ region_id: 'region-9' }] }, // store also in a foreign region
      },
    })
    const res = await get()
    expect(res.status).toBe(403)
  })
})

// ===========================================================================
// Happy paths (regional_manager who owns the ticket)
// ===========================================================================
describe('GET /api/tickets/[id]/signoff — happy paths', () => {
  const pendingSubmission = {
    id: 's2',
    status: 'submitted',
    before_urls: ['before-1.jpg', 'before-2.jpg'],
    after_urls: ['after-1.jpg'],
    coc_url: 'coc.pdf',
    invoice_url: null,
    notes: 'All done',
    created_at: '2026-07-01T10:00:00Z',
  }

  it('200 via direct region match — returns the pending submission with signed URLs and 1-based label', async () => {
    seed({
      tables: {
        regional_users: { rows: [{ region_id: 'region-1' }] },
        signoffs: { rows: [{ id: 's1', status: 'approved' }, pendingSubmission] },
      },
    })
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.submission).toMatchObject({
      id: 's2',
      label: 'Submission #2', // ordinal across ALL submissions, oldest first
      beforeUrls: ['signed:before-1.jpg', 'signed:before-2.jpg'],
      afterUrls: ['signed:after-1.jpg'],
      cocUrl: 'signed:coc.pdf',
      invoiceUrl: null,
      notes: 'All done',
    })
  })

  it("200 via the store-region fallback when tickets.region_id is null (stale/unlinked)", async () => {
    seed({
      ticket: { ...TICKET, region_id: null },
      tables: {
        regional_users: { rows: [{ region_id: 'region-1' }] },
        stores: { rows: [{ region_id: 'region-1' }] },
        signoffs: { rows: [pendingSubmission] },
      },
    })
    const res = await get()
    expect(res.status).toBe(200)
    expect((await res.json()).submission).toMatchObject({ id: 's2', label: 'Submission #1' })
  })

  it('200 with { submission: null } when nothing is awaiting review', async () => {
    seed({
      tables: {
        regional_users: { rows: [{ region_id: 'region-1' }] },
        signoffs: { rows: [{ id: 's1', status: 'approved' }, { id: 's2', status: 'rejected' }] },
      },
    })
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ submission: null })
  })

  it('200 picks the MOST RECENT still-pending submission and skips decided ones', async () => {
    seed({
      tables: {
        regional_users: { rows: [{ region_id: 'region-1' }] },
        signoffs: { rows: [
          { id: 's1', status: 'submitted', created_at: '2026-06-01T00:00:00Z' },
          { id: 's2', status: 'rejected', created_at: '2026-06-10T00:00:00Z' },
          { id: 's3', status: 'awaiting_regional', before_urls: [], after_urls: [], coc_url: null, invoice_url: null, notes: null, created_at: '2026-06-20T00:00:00Z' },
        ] },
      },
    })
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.submission).toMatchObject({ id: 's3', label: 'Submission #3', notes: null, cocUrl: null })
  })
})
