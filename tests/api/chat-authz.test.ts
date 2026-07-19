import { describe, it, expect, beforeEach, vi } from 'vitest'
import { jsonRequest } from '../helpers/supabase-mock'

// ---------------------------------------------------------------------------
// Integration authZ tests for the per-ticket chat route:
//   • GET  /api/tickets/[id]/chat  (thread + viewer seat + SM participation)
//   • POST /api/tickets/[id]/chat  (send / add_sm / remove_sm)
//
// Supabase is mocked (no DB) — each table returns a fixed fixture; the handlers
// authorize on the rows a table yields. SM participation is simulated by seeding
// ticket_chat_settings with (or without) a sm_added_at row.
//
// Business rules under test:
//   • supplier seat requires membership of the AWARDED supplier org
//   • RM seat requires same-company + region ownership (rmOwnsTicket, real code)
//   • the ticket's SM only has a seat once the RM added them (sm_added_at)
//   • the individual owner (tickets.created_by) holds the manager seat on
//     standalone tickets; other individuals get 403
//   • add_sm / remove_sm is RM (or system_admin) only, and 400 on standalone
//     tickets (no store side)
// ---------------------------------------------------------------------------

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
// NOT mocked: @/lib/validate (zod) and @/lib/rm-ticket-access (rmOwnsTicket).

import { GET, POST } from '@/app/api/tickets/[id]/chat/route'

const ME = 'user-me'
const OTHER = 'user-other'
const params = { params: Promise.resolve({ id: 'ticket-1' }) }
const getReq = new Request('http://test.local/api/tickets/ticket-1/chat')

const companyTicket = {
  id: 'ticket-1', title: 'Leaking geyser',
  company_id: 'company-A', region_id: 'region-1', store_id: 'store-1',
  supplier_id: 'sup-1', created_by: OTHER,
}
const soloTicket = {
  id: 'ticket-1', title: 'Broken gate',
  company_id: null, region_id: null, store_id: null,
  supplier_id: 'sup-1', created_by: ME,
}
const smAddedRow = { ticket_id: 'ticket-1', sm_added_at: '2026-07-19T00:00:00Z', sm_history_from: null }

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
    // Empty by default: no memberships, no messages, SM not added.
    regional_users: { rows: [] },
    supplier_users: { rows: [] },
    store_users: { rows: [] },
    stores: { rows: [] },
    ticket_chat_settings: { rows: [] },
    ticket_chat_messages: { rows: [] },
    ticket_chat_reads: { rows: [] },
    notifications: { rows: [] },
    ...opts.tables,
  }
}

beforeEach(() => { H.state.user = null; H.state.tables = {} })

// ===========================================================================
// GET — seats
// ===========================================================================
describe('GET /api/tickets/[id]/chat — seats', () => {
  it('401 when unauthenticated', async () => {
    seed({ user: null })
    expect((await GET(getReq, params)).status).toBe(401)
  })

  it('200 for a user of the AWARDED supplier', async () => {
    seed({
      profile: { role: 'supplier', company_id: null }, ticket: companyTicket,
      tables: { supplier_users: { rows: [{ user_id: ME, supplier_id: 'sup-1' }] } },
    })
    const res = await GET(getReq, params)
    expect(res.status).toBe(200)
    expect((await res.json()).viewerRole).toBe('supplier')
  })

  it("403 for a supplier user who is NOT in the awarded org", async () => {
    seed({ profile: { role: 'supplier', company_id: null }, ticket: companyTicket })
    expect((await GET(getReq, params)).status).toBe(403)
  })

  it("200 for the region's RM, who can manage the SM", async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'company-A' }, ticket: companyTicket,
      tables: { regional_users: { rows: [{ user_id: ME, region_id: 'region-1' }] } },
    })
    const res = await GET(getReq, params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.viewerRole).toBe('regional_manager')
    expect(body.canManageSm).toBe(true)
  })

  it('403 for the store SM when NOT added to the chat', async () => {
    seed({
      profile: { role: 'store_manager', company_id: 'company-A' }, ticket: companyTicket,
      tables: { store_users: { rows: [{ user_id: ME, store_id: 'store-1' }] } },
    })
    expect((await GET(getReq, params)).status).toBe(403)
  })

  it('200 for the store SM once added', async () => {
    seed({
      profile: { role: 'store_manager', company_id: 'company-A' }, ticket: companyTicket,
      tables: {
        store_users: { rows: [{ user_id: ME, store_id: 'store-1' }] },
        ticket_chat_settings: { rows: [smAddedRow] },
      },
    })
    const res = await GET(getReq, params)
    expect(res.status).toBe(200)
    expect((await res.json()).viewerRole).toBe('store_manager')
  })

  it('403 for an added-SM ticket when the caller is not one of the store’s SMs', async () => {
    seed({
      profile: { role: 'store_manager', company_id: 'company-A' }, ticket: companyTicket,
      tables: { ticket_chat_settings: { rows: [smAddedRow] } }, // store_users empty
    })
    expect((await GET(getReq, params)).status).toBe(403)
  })

  it('200 for the individual owner of a standalone ticket', async () => {
    seed({ profile: { role: 'individual', company_id: null }, ticket: soloTicket })
    const res = await GET(getReq, params)
    expect(res.status).toBe(200)
    expect((await res.json()).viewerRole).toBe('individual')
  })

  it('403 for an individual who does NOT own the ticket', async () => {
    seed({ profile: { role: 'individual', company_id: null }, ticket: { ...soloTicket, created_by: OTHER } })
    expect((await GET(getReq, params)).status).toBe(403)
  })
})

// ===========================================================================
// POST — send
// ===========================================================================
describe('POST /api/tickets/[id]/chat — send', () => {
  it('403 for the store SM when not added', async () => {
    seed({
      profile: { role: 'store_manager', company_id: 'company-A' }, ticket: companyTicket,
      tables: { store_users: { rows: [{ user_id: ME, store_id: 'store-1' }] } },
    })
    expect((await POST(jsonRequest({ body: 'hello' }), params)).status).toBe(403)
  })

  it('200 for the store SM once added', async () => {
    seed({
      profile: { role: 'store_manager', company_id: 'company-A' }, ticket: companyTicket,
      tables: {
        store_users: { rows: [{ user_id: ME, store_id: 'store-1' }] },
        ticket_chat_settings: { rows: [smAddedRow] },
      },
    })
    expect((await POST(jsonRequest({ body: 'hello' }), params)).status).toBe(200)
  })

  it('400 when there is no awarded supplier yet', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'company-A' },
      ticket: { ...companyTicket, supplier_id: null },
      tables: { regional_users: { rows: [{ user_id: ME, region_id: 'region-1' }] } },
    })
    expect((await POST(jsonRequest({ body: 'hello' }), params)).status).toBe(400)
  })
})

// ===========================================================================
// POST — participant management
// ===========================================================================
describe('POST /api/tickets/[id]/chat — add_sm / remove_sm', () => {
  it("add_sm succeeds for the region's RM", async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'company-A' }, ticket: companyTicket,
      tables: { regional_users: { rows: [{ user_id: ME, region_id: 'region-1' }] } },
    })
    const res = await POST(jsonRequest({ action: 'add_sm', history: 'from_now' }), params)
    expect(res.status).toBe(200)
    expect((await res.json()).smAdded).toBe(true)
  })

  it('403 when a supplier tries to add the SM', async () => {
    seed({
      profile: { role: 'supplier', company_id: null }, ticket: companyTicket,
      tables: { supplier_users: { rows: [{ user_id: ME, supplier_id: 'sup-1' }] } },
    })
    expect((await POST(jsonRequest({ action: 'add_sm', history: 'full' }), params)).status).toBe(403)
  })

  it('403 when the SM tries to add themselves', async () => {
    seed({
      profile: { role: 'store_manager', company_id: 'company-A' }, ticket: companyTicket,
      tables: { store_users: { rows: [{ user_id: ME, store_id: 'store-1' }] } },
    })
    expect((await POST(jsonRequest({ action: 'add_sm', history: 'full' }), params)).status).toBe(403)
  })

  it("403 for an RM from another company's region", async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'company-B' }, ticket: companyTicket,
      tables: { regional_users: { rows: [{ user_id: ME, region_id: 'region-1' }] } },
    })
    expect((await POST(jsonRequest({ action: 'add_sm', history: 'full' }), params)).status).toBe(403)
  })

  it('400 on a standalone ticket (no store side to add)', async () => {
    seed({ profile: { role: 'system_admin', company_id: null }, ticket: soloTicket })
    expect((await POST(jsonRequest({ action: 'add_sm', history: 'full' }), params)).status).toBe(400)
  })

  it('remove_sm succeeds for the RM', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'company-A' }, ticket: companyTicket,
      tables: {
        regional_users: { rows: [{ user_id: ME, region_id: 'region-1' }] },
        ticket_chat_settings: { rows: [smAddedRow] },
      },
    })
    const res = await POST(jsonRequest({ action: 'remove_sm' }), params)
    expect(res.status).toBe(200)
    expect((await res.json()).smAdded).toBe(false)
  })
})
