import { describe, it, expect, beforeEach, vi } from 'vitest'
import { jsonRequest } from '../helpers/supabase-mock'

// ---------------------------------------------------------------------------
// Integration authZ tests for the dispute thread route:
//   • POST /api/tickets/[id]/dispute  (raise / reply / withdraw / retract /
//                                      propose / confirm / cancel)
//   • GET  /api/tickets/[id]/dispute  (open dispute + messages)
//
// Supabase is mocked so no DB is required — each table returns a fixed fixture
// (the handlers authorize on the ROWS a table yields, not on the filter). The
// route's "open dispute" lookup filters at the DB (`.eq('status','open')`), so
// an "already resolved" dispute is simulated by seeding ticket_disputes empty —
// exactly what that query would return once the dispute is no longer open.
//
// Business rules under test:
//   • only the awarded supplier's users may RAISE; only the resolver side
//     (RM / executive / Individual-owner) may RETRACT; only the supplier may
//     WITHDRAW (concede)
//   • the Individual-as-resolver path on company-null tickets is gated by
//     tickets.created_by
//   • cross-company access 404s with the same body as a missing ticket
//   • resolving an already-resolved dispute → 409 (no open dispute)
//   • invalid body → 400 (zod), unknown action → 400
// ---------------------------------------------------------------------------

// State + builder live in vi.hoisted so the (hoisted) vi.mock factory can reach
// them — a normal import isn't initialised when the factory first runs.
// Extended over the tickets-authz builder: `.insert(payload)` is remembered so a
// following `.select().single()` yields the inserted row (with a stub id) instead
// of the table fixture — the raise flow does `insert(...).select('id').single()`
// on ticket_disputes, whose FIXTURE must stay empty for "no open dispute".
const H = vi.hoisted(() => {
  const state: { user: any; tables: Record<string, { rows?: any[]; error?: any }> } = {
    user: null,
    tables: {},
  }
  const CHAIN = [
    'select', 'update', 'delete', 'upsert',
    'eq', 'neq', 'in', 'ilike', 'like', 'is', 'not',
    'gt', 'gte', 'lt', 'lte', 'contains', 'or', 'filter',
    'order', 'limit', 'range',
  ]
  function builder(table: string) {
    const conf = state.tables[table] ?? {}
    const rows = conf.rows ?? []
    const error = conf.error ?? null
    let inserted: any = null
    const b: any = {}
    const chain = () => b
    for (const m of CHAIN) b[m] = chain
    b.insert = (payload: any) => {
      inserted = Array.isArray(payload) ? payload[0] : payload
      return b
    }
    const first = () => (inserted ? { id: `${table}-new`, ...inserted } : (rows[0] ?? null))
    b.single = () => Promise.resolve({ data: first(), error })
    b.maybeSingle = () => Promise.resolve({ data: first(), error })
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
vi.mock('@/lib/storage', () => ({ signManyUrls: async (urls: string[]) => urls }))
// NOT mocked (pure over the mocked admin client, so the real logic is exercised):
// @/lib/validate (zod body parsing) and @/lib/rm-ticket-access (rmOwnsTicket).

// Imported AFTER the mocks (vi.mock is hoisted above these imports).
import { GET, POST } from '@/app/api/tickets/[id]/dispute/route'

const ME = 'user-me'
const OTHER = 'user-other'
// Next 16: route handlers receive params as a Promise (awaited in the handler).
const params = { params: Promise.resolve({ id: 'ticket-1' }) }

// A normal company ticket sitting in a snag (disputable) state.
const companyTicket = {
  id: 'ticket-1', title: 'Leaking geyser', status: 'snag',
  company_id: 'company-A', region_id: 'region-1', store_id: 'store-1',
  supplier_id: 'sup-1', created_by: OTHER,
}
// A standalone Individual ticket — no company/region/store; owner = ME.
const soloTicket = {
  id: 'ticket-1', title: 'Broken gate', status: 'snag',
  company_id: null, region_id: null, store_id: null,
  supplier_id: 'sup-1', created_by: ME,
}
const openDispute = {
  id: 'disp-1', ticket_id: 'ticket-1', status: 'open', origin: 'snag',
  pending_outcome: null, pending_by: null, created_at: '2026-07-01T00:00:00Z',
}
// Link-table rows granting the caller access.
const asAwardedSupplier = { supplier_users: { rows: [{ user_id: ME, supplier_id: 'sup-1' }] } }
const asRegionRM = { regional_users: { rows: [{ user_id: ME, region_id: 'region-1' }] } }

/** Seed the mock: caller profile + the ticket + any link/dispute tables. */
function seed(opts: {
  user?: string | null
  profile?: Record<string, any> | null
  ticket?: Record<string, any> | null
  tables?: Record<string, { rows?: any[]; error?: any }>
}) {
  H.state.user = opts.user === undefined ? { id: ME } : (opts.user === null ? null : { id: opts.user })
  H.state.tables = {
    user_profiles: { rows: opts.profile === null ? [] : [opts.profile ?? { role: 'individual', company_id: null }] },
    tickets: { rows: opts.ticket === null ? [] : [opts.ticket ?? {}] },
    // Empty by default: no memberships, no open dispute, no signoffs/snags.
    regional_users: { rows: [] },
    supplier_users: { rows: [] },
    stores: { rows: [] },
    ticket_disputes: { rows: [] },
    ticket_dispute_messages: { rows: [] },
    ticket_variations: { rows: [] },
    signoffs: { rows: [] },
    snags: { rows: [] },
    notifications: { rows: [] },
    ...opts.tables,
  }
}

beforeEach(() => { H.state.user = null; H.state.tables = {} })

// ===========================================================================
// POST — authentication & role gate
// ===========================================================================
describe('POST /api/tickets/[id]/dispute — auth & role gate', () => {
  it('401 when unauthenticated', async () => {
    seed({ user: null })
    const res = await POST(jsonRequest({ action: 'raise', body: 'x' }), params)
    expect(res.status).toBe(401)
  })

  it('403 when the caller has no profile row', async () => {
    seed({ profile: null, ticket: companyTicket })
    const res = await POST(jsonRequest({ action: 'raise', body: 'x' }), params)
    expect(res.status).toBe(403)
  })

  it('403 for a store_manager (no side in a dispute)', async () => {
    seed({
      profile: { role: 'store_manager', company_id: 'company-A' },
      ticket: companyTicket,
    })
    const res = await POST(jsonRequest({ action: 'reply', body: 'x' }), params)
    expect(res.status).toBe(403)
  })

  it('403 for a regional_manager with no company', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: null },
      ticket: companyTicket,
    })
    const res = await POST(jsonRequest({ action: 'retract' }), params)
    expect(res.status).toBe(403)
  })
})

// ===========================================================================
// POST — tenant isolation & ownership
// ===========================================================================
describe('POST /api/tickets/[id]/dispute — tenant & ownership', () => {
  it('404 when the ticket does not exist', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'company-A' },
      ticket: null,
    })
    const res = await POST(jsonRequest({ action: 'retract' }), params)
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Ticket not found')
  })

  it('404 for an RM on a DIFFERENT company ticket — same body as missing (existence not leaked)', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'company-B' },
      ticket: companyTicket, // company-A
      tables: { ...asRegionRM },
    })
    const res = await POST(jsonRequest({ action: 'retract' }), params)
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Ticket not found')
  })

  it('403 for a supplier user NOT on the awarded supplier', async () => {
    seed({
      profile: { role: 'supplier', company_id: null },
      ticket: companyTicket,
      tables: { supplier_users: { rows: [{ user_id: OTHER, supplier_id: 'sup-1' }] } },
    })
    const res = await POST(jsonRequest({ action: 'raise', body: 'x' }), params)
    expect(res.status).toBe(403)
  })

  it('403 for an RM of the right company but the wrong region', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'company-A' },
      ticket: { ...companyTicket, region_id: 'region-2' },
      tables: { ...asRegionRM }, // ME is linked to region-1 only; stores lookup empty
    })
    const res = await POST(jsonRequest({ action: 'retract' }), params)
    expect(res.status).toBe(403)
  })

  it('403 for an individual who is NOT the creator of a company-null ticket', async () => {
    seed({
      profile: { role: 'individual', company_id: null },
      ticket: { ...soloTicket, created_by: OTHER },
      tables: { ticket_disputes: { rows: [openDispute] } },
    })
    const res = await POST(jsonRequest({ action: 'retract' }), params)
    expect(res.status).toBe(403)
  })
})

// ===========================================================================
// POST action=raise — supplier-only, state-gated
// ===========================================================================
describe('POST dispute action=raise', () => {
  it('awarded supplier raising on a snag ticket → 200', async () => {
    seed({
      profile: { role: 'supplier', company_id: null },
      ticket: companyTicket, // status 'snag', no open dispute seeded
      tables: { ...asAwardedSupplier },
    })
    const res = await POST(jsonRequest({ action: 'raise', body: 'This snag is not ours.' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it('RM cannot raise → 403', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'company-A' },
      ticket: companyTicket,
      tables: { ...asRegionRM },
    })
    const res = await POST(jsonRequest({ action: 'raise', body: 'x' }), params)
    expect(res.status).toBe(403)
  })

  it('individual owner (resolver side) cannot raise → 403', async () => {
    seed({
      profile: { role: 'individual', company_id: null },
      ticket: soloTicket,
    })
    const res = await POST(jsonRequest({ action: 'raise', body: 'x' }), params)
    expect(res.status).toBe(403)
  })

  it('supplier raising on a non-disputable status → 400', async () => {
    seed({
      profile: { role: 'supplier', company_id: null },
      ticket: { ...companyTicket, status: 'in_progress' },
      tables: { ...asAwardedSupplier },
    })
    const res = await POST(jsonRequest({ action: 'raise', body: 'x' }), params)
    expect(res.status).toBe(400)
  })

  it('supplier raising while a dispute is already open → 409', async () => {
    seed({
      profile: { role: 'supplier', company_id: null },
      ticket: companyTicket,
      tables: { ...asAwardedSupplier, ticket_disputes: { rows: [openDispute] } },
    })
    const res = await POST(jsonRequest({ action: 'raise', body: 'x' }), params)
    expect(res.status).toBe(409)
  })

  it('supplier raising with no message and no evidence → 400', async () => {
    seed({
      profile: { role: 'supplier', company_id: null },
      ticket: companyTicket,
      tables: { ...asAwardedSupplier },
    })
    const res = await POST(jsonRequest({ action: 'raise', body: '   ', evidenceUrls: [] }), params)
    expect(res.status).toBe(400)
  })
})

// ===========================================================================
// POST resolve (withdraw / retract) — who may resolve, and resolved-twice
// ===========================================================================
describe('POST dispute resolve — withdraw/retract', () => {
  it('RM retracting (drops the request) → 200', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'company-A' },
      ticket: companyTicket,
      tables: { ...asRegionRM, ticket_disputes: { rows: [openDispute] } },
    })
    const res = await POST(jsonRequest({ action: 'retract', note: 'Fair point' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it('executive of the same company (with region link) retracting → 200', async () => {
    seed({
      profile: { role: 'executive', company_id: 'company-A' },
      ticket: companyTicket,
      tables: { ...asRegionRM, ticket_disputes: { rows: [openDispute] } },
    })
    const res = await POST(jsonRequest({ action: 'retract' }), params)
    expect(res.status).toBe(200)
  })

  it('individual owner resolving on their company-null ticket → 200 (individual-as-resolver path)', async () => {
    seed({
      profile: { role: 'individual', company_id: null },
      ticket: soloTicket, // created_by = ME, company_id null
      tables: { ticket_disputes: { rows: [openDispute] } },
    })
    const res = await POST(jsonRequest({ action: 'retract' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it('supplier withdrawing (concedes, request stands) → 200', async () => {
    seed({
      profile: { role: 'supplier', company_id: null },
      ticket: companyTicket,
      tables: { ...asAwardedSupplier, ticket_disputes: { rows: [openDispute] } },
    })
    const res = await POST(jsonRequest({ action: 'withdraw' }), params)
    expect(res.status).toBe(200)
  })

  it('supplier trying to RETRACT (manager-only) → 403', async () => {
    seed({
      profile: { role: 'supplier', company_id: null },
      ticket: companyTicket,
      tables: { ...asAwardedSupplier, ticket_disputes: { rows: [openDispute] } },
    })
    const res = await POST(jsonRequest({ action: 'retract' }), params)
    expect(res.status).toBe(403)
  })

  it('RM trying to WITHDRAW (supplier-only) → 403', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'company-A' },
      ticket: companyTicket,
      tables: { ...asRegionRM, ticket_disputes: { rows: [openDispute] } },
    })
    const res = await POST(jsonRequest({ action: 'withdraw' }), params)
    expect(res.status).toBe(403)
  })

  it('retracting when the dispute is already resolved → 409 (no open dispute)', async () => {
    // The route's lookup filters .eq('status','open') at the DB; a resolved
    // dispute therefore yields NO row — seed ticket_disputes empty.
    seed({
      profile: { role: 'regional_manager', company_id: 'company-A' },
      ticket: companyTicket,
      tables: { ...asRegionRM, ticket_disputes: { rows: [] } },
    })
    const res = await POST(jsonRequest({ action: 'retract' }), params)
    expect(res.status).toBe(409)
  })

  it('supplier withdrawing when the dispute is already resolved → 409', async () => {
    seed({
      profile: { role: 'supplier', company_id: null },
      ticket: companyTicket,
      tables: { ...asAwardedSupplier, ticket_disputes: { rows: [] } },
    })
    const res = await POST(jsonRequest({ action: 'withdraw' }), params)
    expect(res.status).toBe(409)
  })
})

// ===========================================================================
// POST propose / confirm — two-party agreement flow
// ===========================================================================
describe('POST dispute propose/confirm', () => {
  it('confirm with no pending proposal → 400', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'company-A' },
      ticket: companyTicket,
      tables: { ...asRegionRM, ticket_disputes: { rows: [openDispute] } },
    })
    const res = await POST(jsonRequest({ action: 'confirm' }), params)
    expect(res.status).toBe(400)
  })

  it('proposer confirming their OWN proposal → 403', async () => {
    seed({
      profile: { role: 'supplier', company_id: null },
      ticket: companyTicket,
      tables: {
        ...asAwardedSupplier,
        ticket_disputes: { rows: [{ ...openDispute, pending_outcome: 'withdrawn', pending_by: 'supplier' }] },
      },
    })
    const res = await POST(jsonRequest({ action: 'confirm' }), params)
    expect(res.status).toBe(403)
  })

  it('the OTHER party confirming the proposal → 200 (resolves)', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'company-A' },
      ticket: companyTicket,
      tables: {
        ...asRegionRM,
        ticket_disputes: { rows: [{ ...openDispute, pending_outcome: 'withdrawn', pending_by: 'supplier' }] },
      },
    })
    const res = await POST(jsonRequest({ action: 'confirm' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })
})

// ===========================================================================
// POST — body validation
// ===========================================================================
describe('POST dispute — body validation', () => {
  it('400 when the body fails the schema (non-string action)', async () => {
    seed({
      profile: { role: 'supplier', company_id: null },
      ticket: companyTicket,
      tables: { ...asAwardedSupplier },
    })
    const res = await POST(jsonRequest({ action: 123 }), params)
    expect(res.status).toBe(400)
  })

  it('400 when evidenceUrls is not an array', async () => {
    seed({
      profile: { role: 'supplier', company_id: null },
      ticket: companyTicket,
      tables: { ...asAwardedSupplier },
    })
    const res = await POST(jsonRequest({ action: 'raise', body: 'x', evidenceUrls: 'not-an-array' }), params)
    expect(res.status).toBe(400)
  })

  it('400 on an unknown action (valid access)', async () => {
    seed({
      profile: { role: 'supplier', company_id: null },
      ticket: companyTicket,
      tables: { ...asAwardedSupplier, ticket_disputes: { rows: [openDispute] } },
    })
    const res = await POST(jsonRequest({ action: 'nonsense' }), params)
    expect(res.status).toBe(400)
  })
})

// ===========================================================================
// GET — access mirrors the POST gate
// ===========================================================================
describe('GET /api/tickets/[id]/dispute — authZ', () => {
  it('401 when unauthenticated', async () => {
    seed({ user: null })
    const res = await GET(jsonRequest(undefined, 'GET'), params)
    expect(res.status).toBe(401)
  })

  it('403 for a store_manager', async () => {
    seed({
      profile: { role: 'store_manager', company_id: 'company-A' },
      ticket: companyTicket,
    })
    const res = await GET(jsonRequest(undefined, 'GET'), params)
    expect(res.status).toBe(403)
  })

  it('404 when the ticket does not exist', async () => {
    seed({
      profile: { role: 'supplier', company_id: null },
      ticket: null,
    })
    const res = await GET(jsonRequest(undefined, 'GET'), params)
    expect(res.status).toBe(404)
  })

  it('awarded supplier sees the open dispute + messages → 200', async () => {
    seed({
      profile: { role: 'supplier', company_id: null },
      ticket: companyTicket,
      tables: {
        ...asAwardedSupplier,
        ticket_disputes: { rows: [openDispute] },
        ticket_dispute_messages: {
          rows: [{ id: 'm1', author_role: 'supplier', body: 'hello', evidence_urls: ['a.jpg'], created_at: '2026-07-01T00:00:00Z' }],
        },
      },
    })
    const res = await GET(jsonRequest(undefined, 'GET'), params)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.viewerRole).toBe('supplier')
    expect(json.dispute).toMatchObject({ id: 'disp-1' })
    expect(json.messages).toHaveLength(1)
  })

  it('individual owner of a company-null ticket, no open dispute → 200 { dispute: null }', async () => {
    seed({
      profile: { role: 'individual', company_id: null },
      ticket: soloTicket,
    })
    const res = await GET(jsonRequest(undefined, 'GET'), params)
    expect(res.status).toBe(200)
    expect((await res.json()).dispute).toBeNull()
  })

  it('individual who is NOT the owner → 403', async () => {
    seed({
      profile: { role: 'individual', company_id: null },
      ticket: { ...soloTicket, created_by: OTHER },
    })
    const res = await GET(jsonRequest(undefined, 'GET'), params)
    expect(res.status).toBe(403)
  })
})
