import { describe, it, expect, beforeEach, vi } from 'vitest'
import { jsonRequest } from '../helpers/supabase-mock'

// ---------------------------------------------------------------------------
// Integration authZ tests for POST /api/provision — delegated provisioning.
//   Exec-only actions: add_region, invite_rm, list_pending_rms, approve_rm, reject_rm
//   RM-only actions:   add_store, invite_store_manager, create_store_manager,
//                      store_detail, update_store, (de|re)activate_store, delete_store
//   Exec or RM:        add_supplier, invite_supplier
//
// Supabase is mocked (no DB) — each table returns a fixed fixture. What we
// guard: the role gate per action, tenant scoping (a region/store belonging to
// ANOTHER company must be rejected even though the admin client bypasses RLS),
// and body validation (unknown action / wrong-typed body / missing fields).
// ---------------------------------------------------------------------------

// State + builder live in vi.hoisted so the (hoisted) vi.mock factories can
// reach them — a normal import isn't initialised when the factory first runs.
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
  const admin = {
    from: (t: string) => builder(t),
    auth: { admin: { createUser: vi.fn(), updateUserById: vi.fn(), deleteUser: vi.fn() } },
  }
  const client = {
    from: (t: string) => builder(t),
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  }
  // Side-effect modules the route imports — recorded so tests can assert they
  // did / did not fire (an invite email must never go out cross-tenant).
  const inviteUser = vi.fn(async () => ({ userId: 'invited-user', actionLink: 'https://example.test/invite', emailed: true }))
  const logAudit = vi.fn(async () => {})
  const sendEmail = vi.fn(async () => true)
  const buildEmail = vi.fn(async () => ({ subject: 's', html: '<p>h</p>', text: 't' }))
  return { state, admin, client, inviteUser, logAudit, sendEmail, buildEmail }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => H.client,
  createAdminClient: () => H.admin,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => true }))
vi.mock('@/lib/invite', () => ({ inviteUser: H.inviteUser }))
vi.mock('@/lib/audit', () => ({ logAudit: H.logAudit }))
vi.mock('@/lib/email', () => ({ sendEmail: H.sendEmail }))
vi.mock('@/lib/emails/server', () => ({ buildEmail: H.buildEmail }))

// Imported AFTER the mocks (vi.mock is hoisted above these imports).
import { POST } from '@/app/api/provision/route'

const MY_COMPANY = 'company-A'
const OTHER_COMPANY = 'company-B'

/** Seed the mock: caller profile + table fixtures (all empty by default). */
function seed(opts: {
  user?: string | null
  profile?: Record<string, any> | null
  tables?: Record<string, { rows?: any[]; error?: any }>
}) {
  H.state.user = opts.user === null ? null : { id: opts.user ?? 'user-1' }
  H.state.tables = {
    user_profiles: { rows: opts.profile === null ? [] : [opts.profile ?? { role: 'executive', company_id: MY_COMPANY, full_name: 'Test Exec' }] },
    regions: { rows: [] },
    regional_users: { rows: [] },
    stores: { rows: [] },
    store_users: { rows: [] },
    suppliers: { rows: [] },
    supplier_invites: { rows: [] },
    companies: { rows: [{ name: 'Acme Retail' }] },
    tickets: { rows: [] },
    ...opts.tables,
  }
}

beforeEach(() => {
  H.state.user = null
  H.state.tables = {}
  H.inviteUser.mockClear()
  H.logAudit.mockClear()
  H.sendEmail.mockClear()
  H.buildEmail.mockClear()
})

// ===========================================================================
// Authentication + company gate
// ===========================================================================
describe('POST /api/provision — auth gates', () => {
  it('401 when unauthenticated', async () => {
    seed({ user: null })
    const res = await POST(jsonRequest({ action: 'add_region', name: 'Gauteng' }))
    expect(res.status).toBe(401)
  })

  it('403 when the caller has no company (even with an allowed role)', async () => {
    seed({ profile: { role: 'executive', company_id: null, full_name: 'No Co' } })
    const res = await POST(jsonRequest({ action: 'add_region', name: 'Gauteng' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'No company' })
  })
})

// ===========================================================================
// Role gate — every non-permitted role is 403'd per action family
// ===========================================================================
describe('POST /api/provision — role gates (403 for non-permitted roles)', () => {
  const nonExecRoles = ['regional_manager', 'store_manager', 'client', 'supplier', 'individual'] as const
  it.each(nonExecRoles)('exec-only add_region as %s → 403', async (role) => {
    seed({ profile: { role, company_id: MY_COMPANY, full_name: 'X' } })
    const res = await POST(jsonRequest({ action: 'add_region', name: 'Gauteng' }))
    expect(res.status).toBe(403)
  })

  it.each(nonExecRoles)('exec-only invite_rm as %s → 403 (and no invite fires)', async (role) => {
    seed({
      profile: { role, company_id: MY_COMPANY, full_name: 'X' },
      tables: { regions: { rows: [{ id: 'region-1', company_id: MY_COMPANY }] } },
    })
    const res = await POST(jsonRequest({ action: 'invite_rm', regionId: 'region-1', email: 'rm@example.co.za' }))
    expect(res.status).toBe(403)
    expect(H.inviteUser).not.toHaveBeenCalled()
  })

  const nonRmRoles = ['executive', 'system_admin', 'store_manager', 'client', 'supplier', 'individual'] as const
  it.each(nonRmRoles)('RM-only add_store as %s → 403', async (role) => {
    seed({ profile: { role, company_id: MY_COMPANY, full_name: 'X' } })
    const res = await POST(jsonRequest({ action: 'add_store', branch_code: 'BC01', name: 'Store One' }))
    expect(res.status).toBe(403)
  })

  it.each(nonRmRoles)('RM-only delete_store as %s → 403', async (role) => {
    seed({ profile: { role, company_id: MY_COMPANY, full_name: 'X' } })
    const res = await POST(jsonRequest({ action: 'delete_store', storeId: 'store-1' }))
    expect(res.status).toBe(403)
  })

  const neitherExecNorRm = ['store_manager', 'client', 'supplier', 'individual'] as const
  it.each(neitherExecNorRm)('add_supplier as %s → 403', async (role) => {
    seed({ profile: { role, company_id: MY_COMPANY, full_name: 'X' } })
    const res = await POST(jsonRequest({ action: 'add_supplier', companyName: 'FlowFix' }))
    expect(res.status).toBe(403)
  })
})

// ===========================================================================
// Happy paths for the permitted roles
// ===========================================================================
describe('POST /api/provision — permitted-role happy paths', () => {
  it('executive add_region → 200 ok + audit logged', async () => {
    seed({ profile: { role: 'executive', company_id: MY_COMPANY, full_name: 'Exec' } })
    const res = await POST(jsonRequest({ action: 'add_region', name: 'Gauteng', code: 'GP' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
    expect(H.logAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'provision.add_region', companyId: MY_COMPANY }))
  })

  it('executive invite_rm into an own-company region → 200 with actionLink; invite scoped to caller company', async () => {
    seed({
      profile: { role: 'executive', company_id: MY_COMPANY, full_name: 'Exec' },
      tables: { regions: { rows: [{ id: 'region-1', company_id: MY_COMPANY }] } },
    })
    const res = await POST(jsonRequest({ action: 'invite_rm', regionId: 'region-1', email: 'rm@example.co.za' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, actionLink: 'https://example.test/invite', emailed: true })
    expect(H.inviteUser).toHaveBeenCalledWith(expect.objectContaining({ companyId: MY_COMPANY, role: 'regional_manager' }))
  })

  it('system_admin counts as exec for add_region → 200', async () => {
    seed({ profile: { role: 'system_admin', company_id: MY_COMPANY, full_name: 'Root' } })
    const res = await POST(jsonRequest({ action: 'add_region', name: 'Western Cape' }))
    expect(res.status).toBe(200)
  })

  it('regional manager add_store in their own region → 200 ok + audit logged', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: MY_COMPANY, full_name: 'RM' },
      tables: {
        regional_users: { rows: [{ region_id: 'region-1' }] },
        regions: { rows: [{ id: 'region-1', region_code: 'GP', company_id: MY_COMPANY }] },
      },
    })
    const res = await POST(jsonRequest({ action: 'add_store', branch_code: 'bc01', name: 'Store One' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
    expect(H.logAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'provision.add_store',
      metadata: expect.objectContaining({ branch_code: 'BC01', regionId: 'region-1' }),
    }))
  })

  it('regional manager add_supplier (no email) → 200 ok + audit logged', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: MY_COMPANY, full_name: 'RM' },
      tables: { suppliers: { rows: [{ id: 'sup-1' }] } },
    })
    const res = await POST(jsonRequest({ action: 'add_supplier', companyName: 'FlowFix Plumbing', trade: 'Plumbing' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
    expect(H.logAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'provision.add_supplier', entityId: 'sup-1' }))
  })
})

// ===========================================================================
// Tenant scoping — cannot provision into ANOTHER company
// ===========================================================================
describe('POST /api/provision — tenant scoping', () => {
  it("executive invite_rm into another company's region → 400, no invite sent", async () => {
    seed({
      profile: { role: 'executive', company_id: MY_COMPANY, full_name: 'Exec' },
      tables: { regions: { rows: [{ id: 'region-9', company_id: OTHER_COMPANY }] } },
    })
    const res = await POST(jsonRequest({ action: 'invite_rm', regionId: 'region-9', email: 'rm@example.co.za' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid region' })
    expect(H.inviteUser).not.toHaveBeenCalled()
  })

  it("RM invite_store_manager into another company's store → 400, no invite sent", async () => {
    seed({
      profile: { role: 'regional_manager', company_id: MY_COMPANY, full_name: 'RM' },
      tables: {
        regional_users: { rows: [{ region_id: 'region-1' }] },
        stores: { rows: [{ id: 'store-9', region_id: 'region-1', company_id: OTHER_COMPANY }] },
      },
    })
    const res = await POST(jsonRequest({ action: 'invite_store_manager', storeId: 'store-9', email: 'sm@example.co.za' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Store not in your region' })
    expect(H.inviteUser).not.toHaveBeenCalled()
  })

  it('RM invite_store_manager for a store OUTSIDE their regions (same company) → 400', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: MY_COMPANY, full_name: 'RM' },
      tables: {
        regional_users: { rows: [{ region_id: 'region-1' }] },
        stores: { rows: [{ id: 'store-2', region_id: 'region-2', company_id: MY_COMPANY }] },
      },
    })
    const res = await POST(jsonRequest({ action: 'invite_store_manager', storeId: 'store-2', email: 'sm@example.co.za' }))
    expect(res.status).toBe(400)
    expect(H.inviteUser).not.toHaveBeenCalled()
  })

  it("RM deactivate_store on another company's store → 400", async () => {
    seed({
      profile: { role: 'regional_manager', company_id: MY_COMPANY, full_name: 'RM' },
      tables: {
        regional_users: { rows: [{ region_id: 'region-1' }] },
        stores: { rows: [{ id: 'store-9', region_id: 'region-1', company_id: OTHER_COMPANY }] },
      },
    })
    const res = await POST(jsonRequest({ action: 'deactivate_store', storeId: 'store-9' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Store not in your region' })
  })
})

// ===========================================================================
// Body validation
// ===========================================================================
describe('POST /api/provision — body validation', () => {
  it('unknown action → 400', async () => {
    seed({ profile: { role: 'executive', company_id: MY_COMPANY, full_name: 'Exec' } })
    const res = await POST(jsonRequest({ action: 'become_admin' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Unknown action' })
  })

  it('missing action (empty body) → 400 Unknown action', async () => {
    seed({ profile: { role: 'executive', company_id: MY_COMPANY, full_name: 'Exec' } })
    const res = await POST(jsonRequest({}))
    expect(res.status).toBe(400)
  })

  it('wrong-typed body field (action: 123) → 400 from schema validation', async () => {
    seed({ profile: { role: 'executive', company_id: MY_COMPANY, full_name: 'Exec' } })
    const res = await POST(jsonRequest({ action: 123 }))
    expect(res.status).toBe(400)
  })

  it('add_region without a name → 400', async () => {
    seed({ profile: { role: 'executive', company_id: MY_COMPANY, full_name: 'Exec' } })
    const res = await POST(jsonRequest({ action: 'add_region' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Region name required' })
  })

  it('add_store without branch code/name → 400', async () => {
    seed({
      profile: { role: 'regional_manager', company_id: MY_COMPANY, full_name: 'RM' },
      tables: {
        regional_users: { rows: [{ region_id: 'region-1' }] },
        regions: { rows: [{ id: 'region-1', region_code: 'GP' }] },
      },
    })
    const res = await POST(jsonRequest({ action: 'add_store' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Branch code and name required' })
  })

  it('add_supplier without a supplier name → 400', async () => {
    seed({ profile: { role: 'executive', company_id: MY_COMPANY, full_name: 'Exec' } })
    const res = await POST(jsonRequest({ action: 'add_supplier' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Supplier name required' })
  })
})
