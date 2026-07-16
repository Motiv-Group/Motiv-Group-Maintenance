import { describe, it, expect, beforeEach, vi } from 'vitest'
import { jsonRequest } from '../helpers/supabase-mock'

// ---------------------------------------------------------------------------
// Tenant-isolation suite. Supabase is mocked (no DB) — the mock returns the
// seeded rows for a table regardless of filter, so these exercise the
// HANDLER-LEVEL tenant guards (company / store / region / supplier ownership +
// supplier-scope validation), which is exactly where isolation is enforced,
// because the service-role admin client bypasses RLS. DB-level RLS filtering is
// covered by the owner's live pg_policies checks (see MOTIV_SECURITY §1b).
//
// Boundaries covered:
//   • Company A cannot act on Company B's ticket
//   • Store manager cannot act on another store's ticket
//   • Supplier cannot act on a ticket they are not linked to
//   • Individual cannot act on a ticket they do not own
//   • A supplier from another company/pool cannot be assigned (SEC-008/016)
// ---------------------------------------------------------------------------

const H = vi.hoisted(() => {
  const state: { user: any; tables: Record<string, { rows?: any[]; error?: any }> } = { user: null, tables: {} }
  const CHAIN = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'in', 'ilike', 'like', 'is', 'not', 'gt', 'gte', 'lt', 'lte', 'contains', 'or', 'filter', 'order', 'limit', 'range']
  function builder(table: string) {
    const conf = state.tables[table] ?? {}
    const rows = conf.rows ?? []
    const error = conf.error ?? null
    const b: any = {}
    const chain = () => b
    for (const m of CHAIN) b[m] = chain
    b.single = () => Promise.resolve({ data: rows[0] ?? null, error })
    b.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error })
    b.then = (resolve: any, reject: any) => Promise.resolve({ data: rows, error, count: rows.length }).then(resolve, reject)
    return b
  }
  const admin = { from: (t: string) => builder(t) }
  const client = { from: (t: string) => builder(t), auth: { getUser: async () => ({ data: { user: state.user }, error: null }) } }
  return { state, admin, client }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: () => H.client, createAdminClient: () => H.admin }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => true }))
vi.mock('@/lib/push', () => ({ sendPushToMany: () => {}, sendPushToUser: () => {} }))
vi.mock('@/lib/health/data', () => ({
  loadSlaResolver: async () => () => ({
    quote_due_mins: 60, internal_decision_mins: 60, first_response_mins: 60, attendance_mins: 60, resolution_mins: 60,
  }),
}))

import { POST as TRANSITION } from '@/app/api/tickets/[id]/transition/route'
import { POST as ASSIGN } from '@/app/api/tickets/[id]/assign/route'

const ME = 'user-me'
const params = { params: Promise.resolve({ id: 'ticket-1' }) }
const req = (body: any) => jsonRequest(body, 'POST')

function seed(o: {
  user?: string | null
  profile?: Record<string, any> | null
  ticket?: Record<string, any> | null
  tables?: Record<string, { rows?: any[] }>
}) {
  H.state.user = o.user === undefined ? { id: ME } : (o.user === null ? null : { id: o.user })
  H.state.tables = {
    user_profiles: { rows: o.profile === null ? [] : [o.profile ?? {}] },
    tickets: { rows: o.ticket === null ? [] : [o.ticket ?? {}] },
    regional_users: { rows: [] }, store_users: { rows: [] }, supplier_users: { rows: [] },
    ticket_suppliers: { rows: [] }, ticket_disputes: { rows: [] }, suppliers: { rows: [] },
    quotes: { rows: [] }, notifications: { rows: [] }, ticket_quote_requests: { rows: [] },
    ...o.tables,
  }
}

beforeEach(() => { H.state.user = { id: ME }; H.state.tables = {} })

// ===========================================================================
// Transition — company / store / supplier / individual isolation
// ===========================================================================
describe('POST /api/tickets/[id]/transition — tenant isolation', () => {
  it('401 when unauthenticated', async () => {
    seed({ user: null })
    expect((await TRANSITION(req({ action: 'validate' }), params)).status).toBe(401)
  })

  it('store manager on a DIFFERENT company ticket → 404 (company isolation)', async () => {
    seed({
      profile: { role: 'store_manager', company_id: 'A' },
      ticket: { id: 'ticket-1', company_id: 'B', store_id: 'S1', status: 'open' },
    })
    expect((await TRANSITION(req({ action: 'validate' }), params)).status).toBe(404)
  })

  it('store manager on OWN company but a different store → 403 (store isolation)', async () => {
    seed({
      profile: { role: 'store_manager', company_id: 'A' },
      ticket: { id: 'ticket-1', company_id: 'A', store_id: 'S2', status: 'open' },
      tables: { store_users: { rows: [{ store_id: 'S1' }] } }, // linked to S1, ticket is S2
    })
    expect((await TRANSITION(req({ action: 'start_work' }), params)).status).toBe(403)
  })

  it('supplier with NO link to the ticket → 403 (supplier isolation)', async () => {
    seed({
      profile: { role: 'supplier', company_id: null },
      ticket: { id: 'ticket-1', company_id: 'A', supplier_id: 'sup-9', status: 'assigned' },
      // supplier_users + ticket_suppliers empty → hasAccess false
    })
    expect((await TRANSITION(req({ action: 'start_work' }), params)).status).toBe(403)
  })

  it('individual who does NOT own the ticket → 403', async () => {
    seed({
      profile: { role: 'individual', company_id: null },
      ticket: { id: 'ticket-1', company_id: null, created_by: 'someone-else', status: 'open' },
    })
    expect((await TRANSITION(req({ action: 'validate' }), params)).status).toBe(403)
  })

  it('RM cannot assign a supplier from ANOTHER company → 400 (SEC-008/016)', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'A' },
      ticket: { id: 'ticket-1', company_id: 'A', region_id: 'R1', store_id: 'S1', status: 'assigned', priority: 'P3' },
      tables: {
        regional_users: { rows: [{ region_id: 'R1' }] },       // rmOwnsTicket → true
        suppliers: { rows: [{ id: 'sup-B', company_id: 'B', is_motiv: false }] }, // foreign supplier
      },
    })
    const res = await TRANSITION(req({ action: 'request_quote', supplierId: 'sup-B' }), params)
    expect(res.status).toBe(400)
  })

  it('RM CAN assign an in-company supplier (in-scope) → not 400', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'A' },
      ticket: { id: 'ticket-1', company_id: 'A', region_id: 'R1', store_id: 'S1', status: 'assigned', priority: 'P3' },
      tables: {
        regional_users: { rows: [{ region_id: 'R1' }] },
        suppliers: { rows: [{ id: 'sup-A', company_id: 'A', is_motiv: false }] },
      },
    })
    const res = await TRANSITION(req({ action: 'request_quote', supplierId: 'sup-A' }), params)
    expect(res.status).not.toBe(400)
  })
})

// ===========================================================================
// Assign — role / company / supplier-scope isolation
// ===========================================================================
describe('POST /api/tickets/[id]/assign — tenant isolation', () => {
  it('401 when unauthenticated', async () => {
    seed({ user: null })
    expect((await ASSIGN(req({ supplierIds: ['sup-A'] }), params)).status).toBe(401)
  })

  it('store manager (wrong role) → 403', async () => {
    seed({
      profile: { role: 'store_manager', company_id: 'A' },
      ticket: { id: 'ticket-1', company_id: 'A', status: 'assigned' },
    })
    expect((await ASSIGN(req({ supplierIds: ['sup-A'] }), params)).status).toBe(403)
  })

  it('RM on a DIFFERENT company ticket → 404 (company isolation)', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'A' },
      ticket: { id: 'ticket-1', company_id: 'B', region_id: 'R1', store_id: 'S1', status: 'assigned' },
      tables: { regional_users: { rows: [{ region_id: 'R1' }] } },
    })
    expect((await ASSIGN(req({ supplierIds: ['sup-A'] }), params)).status).toBe(404)
  })

  it('RM assigning a supplier from ANOTHER company → 400 (SEC-008/016)', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'A' },
      ticket: { id: 'ticket-1', company_id: 'A', region_id: 'R1', store_id: 'S1', status: 'assigned', priority: 'P3' },
      tables: {
        regional_users: { rows: [{ region_id: 'R1' }] },
        suppliers: { rows: [{ id: 'sup-B', company_id: 'B', is_motiv: false }] },
      },
    })
    expect((await ASSIGN(req({ supplierIds: ['sup-B'] }), params)).status).toBe(400)
  })

  it('RM assigning a valid in-company supplier → 200', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: 'A', full_name: 'RM' },
      ticket: { id: 'ticket-1', company_id: 'A', region_id: 'R1', store_id: 'S1', status: 'assigned', priority: 'P3', title: 'Leak' },
      tables: {
        regional_users: { rows: [{ region_id: 'R1' }] },
        suppliers: { rows: [{ id: 'sup-A', company_id: 'A', is_motiv: false }] },
      },
    })
    expect((await ASSIGN(req({ supplierIds: ['sup-A'] }), params)).status).toBe(200)
  })
})
