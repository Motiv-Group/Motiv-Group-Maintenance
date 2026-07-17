import { describe, it, expect, beforeEach, vi } from 'vitest'
import { jsonRequest } from '../helpers/supabase-mock'

// ---------------------------------------------------------------------------
// Regression tests for the 2026-07-15 security-hardening batch. Supabase is
// mocked (no DB) — the mock returns the seeded rows for a table regardless of
// filter, so these exercise the HANDLER-LEVEL guards (role / company / owner /
// relationship checks), which is exactly where the tenant fixes live.
//   • GET  /api/suppliers            — company scoping (SEC-003/005/009/015)
//   • POST /api/tickets/[id]/view    — tenant check     (SEC-026)
//   • POST /api/tickets/[id]/seen    — relationship check (SEC-027)
// Filter-level assertions (e.g. .eq('company_id')) and RLS-policy behaviour
// need an integration DB and are tracked as manual/owner verification.
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
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => true }))

import { POST as VIEW } from '@/app/api/tickets/[id]/view/route'
import { POST as SEEN } from '@/app/api/tickets/[id]/seen/route'

const ME = 'user-me'
const params = { params: Promise.resolve({ id: 'ticket-1' }) }

beforeEach(() => { H.state.user = { id: ME }; H.state.tables = {} })

function tables(t: Record<string, { rows?: any[] }>) { H.state.tables = t }

// ===========================================================================
// GET /api/suppliers — SEC-003/005/009/015. The route was first company-scoped
// (main's SEC batch), then DELETED outright by the 2026-07-16 audit branch: it
// had zero callers (its UI was removed in 4a143c9), and a dead scoped route is
// still attack surface. The scoping tests that lived here went with it.
// ===========================================================================

// ===========================================================================
// POST /api/tickets/[id]/view — SEC-026 (tenant check)
// ===========================================================================
describe('POST /api/tickets/[id]/view — tenant check', () => {
  const body = () => jsonRequest({ itemType: 'photo', itemLabel: 'x' }, 'POST')

  it('401 when unauthenticated', async () => {
    H.state.user = null
    const res = await VIEW(body(), params)
    expect(res.status).toBe(401)
  })

  it('404 when the ticket belongs to a DIFFERENT company', async () => {
    tables({ user_profiles: { rows: [{ role: 'store_manager', company_id: 'A' }] }, tickets: { rows: [{ id: 'ticket-1', company_id: 'B' }] } })
    const res = await VIEW(body(), params)
    expect(res.status).toBe(404)
  })

  it('200 when the ticket is in the caller’s own company', async () => {
    tables({ user_profiles: { rows: [{ role: 'store_manager', company_id: 'A' }] }, tickets: { rows: [{ id: 'ticket-1', company_id: 'A' }] } })
    const res = await VIEW(body(), params)
    expect(res.status).toBe(200)
  })
})

// ===========================================================================
// POST /api/tickets/[id]/seen — SEC-027 (relationship check)
// ===========================================================================
describe('POST /api/tickets/[id]/seen — relationship check', () => {
  it('404 for a company user on a DIFFERENT company ticket', async () => {
    tables({ user_profiles: { rows: [{ role: 'store_manager', company_id: 'A' }] }, tickets: { rows: [{ id: 'ticket-1', company_id: 'B', supplier_id: null, created_by: 'x' }] } })
    const res = await SEEN(jsonRequest(undefined, 'POST'), params)
    expect(res.status).toBe(404)
  })

  it('404 for an individual who does NOT own the ticket', async () => {
    tables({ user_profiles: { rows: [{ role: 'individual', company_id: null }] }, tickets: { rows: [{ id: 'ticket-1', company_id: null, supplier_id: null, created_by: 'someone-else' }] } })
    const res = await SEEN(jsonRequest(undefined, 'POST'), params)
    expect(res.status).toBe(404)
  })

  it('200 for the individual owner', async () => {
    tables({ user_profiles: { rows: [{ role: 'individual', company_id: null }] }, tickets: { rows: [{ id: 'ticket-1', company_id: null, supplier_id: null, created_by: ME }] } })
    const res = await SEEN(jsonRequest(undefined, 'POST'), params)
    expect(res.status).toBe(200)
  })

  it('200 for a supplier linked to the ticket’s awarded supplier', async () => {
    tables({
      user_profiles: { rows: [{ role: 'supplier', company_id: null }] },
      tickets: { rows: [{ id: 'ticket-1', company_id: 'A', supplier_id: 'sup-1', created_by: 'x' }] },
      supplier_users: { rows: [{ supplier_id: 'sup-1' }] },
      ticket_suppliers: { rows: [{ id: 'inv-1' }] },
    })
    const res = await SEEN(jsonRequest(undefined, 'POST'), params)
    expect(res.status).toBe(200)
  })

  it('404 for a supplier with NO link to the ticket', async () => {
    tables({
      user_profiles: { rows: [{ role: 'supplier', company_id: null }] },
      tickets: { rows: [{ id: 'ticket-1', company_id: 'A', supplier_id: 'sup-9', created_by: 'x' }] },
      supplier_users: { rows: [] },
      ticket_suppliers: { rows: [] },
    })
    const res = await SEEN(jsonRequest(undefined, 'POST'), params)
    expect(res.status).toBe(404)
  })
})
