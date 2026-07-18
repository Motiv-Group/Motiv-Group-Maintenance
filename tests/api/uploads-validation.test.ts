import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Validation + quota tests for POST /api/uploads (server-side file upload).
//
// The route authenticates via the session cookie, validates bucket/MIME/size/
// count, reserves storage quota atomically via the `reserve_upload_quota` RPC
// (fail-open when the function is missing), then writes each valid file to
// Supabase Storage with the service-role client under a server-generated path
// that is ALWAYS prefixed with the caller's user id (B5 hardening).
//
// Supabase is mocked — no DB/storage required. The admin mock records every
// storage.upload and rpc call so tests can assert on paths and quota args.
// ---------------------------------------------------------------------------

// State + mock clients live in vi.hoisted so the (hoisted) vi.mock factories
// can reach them — a normal import isn't initialised when the factory runs.
const H = vi.hoisted(() => {
  const state: {
    user: any
    rateLimitOk: boolean
    rpc: { data: any; error: any }
    rpcCalls: Array<{ fn: string; args: any }>
    uploads: Array<{ bucket: string; path: string; contentType?: string }>
    uploadError: { message: string } | null
    // When set, the storage mock enforces the bucket's allowed_mime_types the
    // way real Supabase Storage does — rejecting any contentType not on the
    // list. This is what turns the mock from "accepts anything" (false green)
    // into a guard that catches the route sending a type the bucket refuses
    // (e.g. application/octet-stream). Null = accept anything (legacy behaviour).
    allowlist: Record<string, string[]> | null
    // Throw-injection flags — reproduce the real-world causes of a bare 500:
    // a missing service-role key (createAdminClient throws), a cookies/auth
    // failure (getUser throws), and a flaky quota RPC (rpc rejects).
    adminThrows: boolean
    authThrows: boolean
    rpcThrows: boolean
  } = {
    user: null,
    rateLimitOk: true,
    rpc: { data: true, error: null },
    rpcCalls: [],
    uploads: [],
    uploadError: null,
    allowlist: null,
    adminThrows: false,
    authThrows: false,
    rpcThrows: false,
  }
  const admin: any = {
    // Method form (NOT an arrow) that reads `this`, exactly like supabase-js's
    // `rpc(fn){ return this.rest.rpc(...) }`. If the route DETACHES this method
    // (`const r = admin.rpc; r()`), `this` is undefined and it throws the same
    // synchronous TypeError that produced the production "500 undefined". So the
    // route MUST call it bound (`admin.rpc.bind(admin)`) — if a future edit drops
    // the bind, the quota tests below go red instead of shipping the 500.
    rpc(this: unknown, fn: string, args: any) {
      if (this !== admin) throw new TypeError("Cannot read properties of undefined (reading 'rest')")
      state.rpcCalls.push({ fn, args })
      if (state.rpcThrows) throw new Error('rpc network failure')
      return Promise.resolve(state.rpc)
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _buf: unknown, opts?: { contentType?: string }) => {
          if (state.uploadError) return { error: state.uploadError }
          // Mimic Supabase Storage rejecting a type outside the bucket allowlist.
          if (state.allowlist) {
            const allowed = state.allowlist[bucket] ?? []
            const ct = opts?.contentType ?? ''
            if (!allowed.includes(ct)) {
              return { error: { message: `mime type ${ct} is not supported` } }
            }
          }
          state.uploads.push({ bucket, path, contentType: opts?.contentType })
          return { error: null }
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.test/${bucket}/${path}` },
        }),
      }),
    },
  }
  const client = {
    auth: {
      getUser: async () => {
        if (state.authThrows) throw new Error('cookies unavailable')
        return { data: { user: state.user }, error: null }
      },
    },
  }
  return { state, admin, client }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => H.client,
  // createAdminClient throws synchronously in real life when the service-role
  // key/URL env var is missing — model that so the route's guard is tested.
  createAdminClient: () => {
    if (H.state.adminThrows) throw new Error('supabaseKey is required.')
    return H.admin
  },
}))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: async () => H.state.rateLimitOk,
}))

// Imported AFTER the mocks (vi.mock is hoisted above these imports).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { POST, BUCKET_MIME, effectiveType } from '@/app/api/uploads/route'

const USER = 'user-uploader'
const MAX_BYTES = 15 * 1024 * 1024 // mirrors the route's per-file cap

// ---------------------------------------------------------------------------
// Parse the LIVE bucket allowed_mime_types out of supabase/schema.sql (the
// canonical mirror of the production DB). We test the route against these real
// lists instead of a hand-copied duplicate, so if either side drifts the tests
// fail. Matches `('<id>', '<name>', <bool>, <size>, array['a','b',...])` inside
// every `insert into storage.buckets ... ;` block.
// ---------------------------------------------------------------------------
const SCHEMA_SQL = readFileSync(
  fileURLToPath(new URL('../../supabase/schema.sql', import.meta.url)),
  'utf8',
)
function parseBucketAllowlists(sql: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const block of sql.matchAll(/insert into storage\.buckets[\s\S]*?;/gi)) {
    for (const row of block[0].matchAll(/\('([\w-]+)'[^)]*?array\[([^\]]*)\]/gi)) {
      const id = row[1]
      const types = [...row[2].matchAll(/'([^']+)'/g)].map((m) => m[1])
      out[id] = types
    }
  }
  return out
}
const BUCKET_ALLOWLIST = parseBucketAllowlists(SCHEMA_SQL)

/** Build a multipart Request for the handler (NextRequest only uses .formData()). */
function formRequest(form: FormData): any {
  return new Request('http://localhost/api/uploads', { method: 'POST', body: form })
}

/** A File of `bytes` zero bytes (Node 20+ has global File/FormData via undici). */
function makeFile(name: string, type: string, bytes = 8): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

/** FormData with a bucket + files, matching what the browser uploader sends. */
function makeForm(bucket: string, files: File[]): FormData {
  const form = new FormData()
  form.set('bucket', bucket)
  for (const f of files) form.append('files', f)
  return form
}

beforeEach(() => {
  H.state.user = { id: USER }
  H.state.rateLimitOk = true
  H.state.rpc = { data: true, error: null }
  H.state.rpcCalls = []
  H.state.uploads = []
  H.state.uploadError = null
  H.state.adminThrows = false
  H.state.authThrows = false
  H.state.rpcThrows = false
  // Enforce the real per-bucket allowlist for every test — the storage mock now
  // rejects a type the bucket wouldn't accept, exactly like production.
  H.state.allowlist = BUCKET_ALLOWLIST
})

describe('POST /api/uploads — auth & rate limit', () => {
  it('401 when unauthenticated', async () => {
    H.state.user = null
    const res = await POST(formRequest(makeForm('ticket-photos', [makeFile('a.jpg', 'image/jpeg')])))
    expect(res.status).toBe(401)
  })

  it('429 when rate limited', async () => {
    H.state.rateLimitOk = false
    const res = await POST(formRequest(makeForm('ticket-photos', [makeFile('a.jpg', 'image/jpeg')])))
    expect(res.status).toBe(429)
  })
})

describe('POST /api/uploads — request validation', () => {
  it('400 when the body is not multipart form data', async () => {
    const req: any = new Request('http://localhost/api/uploads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nope: true }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/multipart/i)
  })

  it('400 on an invalid bucket (no arbitrary bucket writes)', async () => {
    const res = await POST(formRequest(makeForm('evil-bucket', [makeFile('a.jpg', 'image/jpeg')])))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/bucket/i)
    expect(H.state.uploads).toHaveLength(0)
  })

  it('400 when no files are attached', async () => {
    const res = await POST(formRequest(makeForm('ticket-photos', [])))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no files/i)
  })

  it('400 when more than 10 files are attached', async () => {
    const files = Array.from({ length: 11 }, (_, i) => makeFile(`f${i}.jpg`, 'image/jpeg'))
    const res = await POST(formRequest(makeForm('ticket-photos', files)))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/too many files/i)
    expect(H.state.uploads).toHaveLength(0)
  })
})

describe('POST /api/uploads — per-file validation (failed[])', () => {
  it('oversized file is rejected into failed[] and never reaches storage', async () => {
    const big = makeFile('huge.jpg', 'image/jpeg', MAX_BYTES + 1)
    const res = await POST(formRequest(makeForm('ticket-photos', [big])))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.urls).toEqual([])
    expect(body.failed).toEqual(['huge.jpg'])
    expect(H.state.uploads).toHaveLength(0)
    // Nothing valid → no quota reservation either.
    expect(H.state.rpcCalls).toHaveLength(0)
  })

  it('disallowed MIME is rejected into failed[] while valid siblings upload', async () => {
    // ticket-photos allows images only — a PDF must fail there.
    const pdf = makeFile('quote.pdf', 'application/pdf')
    const jpg = makeFile('photo.jpg', 'image/jpeg')
    const res = await POST(formRequest(makeForm('ticket-photos', [pdf, jpg])))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.failed).toEqual(['quote.pdf'])
    expect(body.urls).toHaveLength(1)
    expect(H.state.uploads).toHaveLength(1)
    expect(H.state.uploads[0].path).toContain('photo.jpg')
  })

  it('storage upload error lands the file in failed[], not urls[]', async () => {
    H.state.uploadError = { message: 'bucket exploded' }
    const res = await POST(formRequest(makeForm('ticket-photos', [makeFile('a.jpg', 'image/jpeg')])))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.urls).toEqual([])
    expect(body.failed).toEqual(['a.jpg'])
  })
})

describe('POST /api/uploads — quota reservation', () => {
  it('413 when reserve_upload_quota returns false (cap reached), nothing uploaded', async () => {
    H.state.rpc = { data: false, error: null }
    const res = await POST(formRequest(makeForm('ticket-photos', [makeFile('a.jpg', 'image/jpeg')])))
    expect(res.status).toBe(413)
    expect(H.state.uploads).toHaveLength(0)
  })

  it('fails open (200) when the quota RPC errors (migration not applied)', async () => {
    H.state.rpc = { data: null, error: { message: 'function reserve_upload_quota does not exist' } }
    const res = await POST(formRequest(makeForm('ticket-photos', [makeFile('a.jpg', 'image/jpeg')])))
    expect(res.status).toBe(200)
    expect((await res.json()).urls).toHaveLength(1)
  })

  it('reserves exactly the valid bytes for the calling user', async () => {
    const a = makeFile('a.jpg', 'image/jpeg', 100)
    const b = makeFile('b.png', 'image/png', 250)
    const tooBig = makeFile('big.jpg', 'image/jpeg', MAX_BYTES + 1) // invalid → not counted
    const res = await POST(formRequest(makeForm('ticket-photos', [a, b, tooBig])))
    expect(res.status).toBe(200)
    expect(H.state.rpcCalls).toHaveLength(1)
    expect(H.state.rpcCalls[0].fn).toBe('reserve_upload_quota')
    expect(H.state.rpcCalls[0].args).toMatchObject({ p_user: USER, p_bytes: 350 })
  })
})

describe('POST /api/uploads — happy path', () => {
  it('200 with urls[] and every object path prefixed by the caller user id', async () => {
    const files = [makeFile('kitchen leak.jpg', 'image/jpeg'), makeFile('geyser.png', 'image/png')]
    const res = await POST(formRequest(makeForm('ticket-photos', files)))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.failed).toEqual([])
    expect(body.urls).toHaveLength(2)
    for (const url of body.urls) {
      expect(url).toContain(`https://cdn.test/ticket-photos/${USER}/`)
    }
    // Server-generated paths: always under the caller's prefix, name sanitised.
    expect(H.state.uploads).toHaveLength(2)
    for (const u of H.state.uploads) {
      expect(u.bucket).toBe('ticket-photos')
      expect(u.path.startsWith(`${USER}/`)).toBe(true)
    }
    expect(H.state.uploads.some((u) => u.path.endsWith('kitchen_leak.jpg'))).toBe(true)
  })

  it('docs bucket accepts a PDF that ticket-photos would reject', async () => {
    const res = await POST(formRequest(makeForm('ticket-docs', [makeFile('manual.pdf', 'application/pdf')])))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.failed).toEqual([])
    expect(body.urls).toHaveLength(1)
    expect(H.state.uploads[0].bucket).toBe('ticket-docs')
  })
})

// ---------------------------------------------------------------------------
// Content-type resolution — the real-world upload-failure bug.
//
// Browsers/OSes sometimes hand us a File with an empty or generic
// `application/octet-stream` type (drag-and-drop, some Android/mobile pickers).
// The route must resolve a concrete type from the extension and store the object
// as THAT, otherwise Supabase Storage rejects the octet-stream against the
// bucket's allowed_mime_types and the upload silently "fails to upload" on every
// page. With the allowlist-enforcing mock above, these tests reproduce that
// failure — they go red against the old `contentType: f.type || octet-stream`.
// ---------------------------------------------------------------------------
describe('POST /api/uploads — effective content type (drag-drop / mobile pickers)', () => {
  it('empty-type image is stored as its real MIME and accepted by the bucket', async () => {
    const res = await POST(formRequest(makeForm('ticket-photos', [makeFile('kitchen.jpg', '')])))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.failed).toEqual([])
    expect(body.urls).toHaveLength(1)
    expect(H.state.uploads[0].contentType).toBe('image/jpeg')
  })

  it('generic octet-stream PDF is re-typed and accepted by completion-docs', async () => {
    const res = await POST(formRequest(makeForm('completion-docs', [makeFile('coc.pdf', 'application/octet-stream')])))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.failed).toEqual([])
    expect(H.state.uploads[0].contentType).toBe('application/pdf')
  })

  it('non-standard image/jpg is normalised to image/jpeg', () => {
    expect(effectiveType(makeFile('a.jpg', 'image/jpg'))).toBe('image/jpeg')
  })

  it('a truly unidentifiable file (no type, no known extension) fails validation, never hits storage', async () => {
    const res = await POST(formRequest(makeForm('ticket-photos', [makeFile('mystery', '')])))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.failed).toEqual(['mystery'])
    expect(H.state.uploads).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Config consistency — static guards that would catch a broken deploy in CI
// BEFORE it reaches prod (buckets never created, or the route accepting a type
// the live bucket rejects). No DB required — schema.sql is the canonical mirror.
// ---------------------------------------------------------------------------
describe('POST /api/uploads — route ⇄ bucket config consistency', () => {
  it('every bucket the route writes to exists in supabase/schema.sql', () => {
    for (const bucket of Object.keys(BUCKET_MIME)) {
      expect(BUCKET_ALLOWLIST[bucket], `bucket "${bucket}" is missing from storage.buckets in schema.sql — uploads to it will fail in prod`).toBeDefined()
    }
  })

  it('every MIME the route accepts is on the live bucket allowlist (no drift)', () => {
    for (const [bucket, types] of Object.entries(BUCKET_MIME)) {
      const live = BUCKET_ALLOWLIST[bucket] ?? []
      for (const t of types) {
        expect(live, `route accepts "${t}" for "${bucket}" but the bucket's allowed_mime_types does not — storage will 400 it`).toContain(t)
      }
    }
  })

  it('every extension the route can infer resolves to a type its bucket allows somewhere', () => {
    // Guards the EXT_MIME table against emitting a type no bucket permits.
    const allLive = new Set(Object.values(BUCKET_ALLOWLIST).flat())
    for (const bucket of Object.keys(BUCKET_MIME)) {
      for (const t of BUCKET_MIME[bucket]) expect(allLive).toContain(t)
    }
  })
})

// ---------------------------------------------------------------------------
// Never a bare 500 — the actual production failure was `[upload] /api/uploads
// failed: 500 undefined`, i.e. the handler THREW (Next returned an empty-body
// 500 the client couldn't read) instead of returning its own JSON. These tests
// inject the real-world throw causes and assert the route always resolves with a
// readable NextResponse — never rejects, never a bare 500. They go red against
// the un-hardened handler (which awaited createAdminClient / the quota rpc with
// no try/catch).
// ---------------------------------------------------------------------------
describe('POST /api/uploads — resilience: never a bare 500', () => {
  it('missing service-role key (createAdminClient throws) → JSON 500, not a thrown error', async () => {
    H.state.adminThrows = true
    // Must RESOLVE (not reject) — a rejection would surface as Next\'s opaque 500.
    const res = await POST(formRequest(makeForm('ticket-photos', [makeFile('a.jpg', 'image/jpeg')])))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.error.length).toBeGreaterThan(0)
    expect(H.state.uploads).toHaveLength(0)
  })

  it('auth/cookies failure (getUser throws) → JSON 500, not a thrown error', async () => {
    H.state.authThrows = true
    const res = await POST(formRequest(makeForm('ticket-photos', [makeFile('a.jpg', 'image/jpeg')])))
    expect(res.status).toBe(500)
    expect(typeof (await res.json()).error).toBe('string')
  })

  it('calls the quota RPC BOUND to the client — a detached call would throw like prod', async () => {
    // The this-aware rpc mock throws unless called bound to `admin`. If the route
    // regresses to `const r = admin.rpc` (unbound), the call throws, gets caught
    // by the fail-open guard, and rpcCalls stays empty → this assertion fails,
    // catching the exact production "500 undefined" bug before it ships.
    const res = await POST(formRequest(makeForm('ticket-photos', [makeFile('a.jpg', 'image/jpeg', 100)])))
    expect(res.status).toBe(200)
    expect(H.state.rpcCalls).toHaveLength(1)
    expect(H.state.rpcCalls[0].fn).toBe('reserve_upload_quota')
  })

  it('a flaky quota RPC that REJECTS fails open (200), upload still proceeds', async () => {
    H.state.rpcThrows = true
    const res = await POST(formRequest(makeForm('ticket-photos', [makeFile('a.jpg', 'image/jpeg', 100)])))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.urls).toHaveLength(1)
    expect(body.failed).toEqual([])
  })

  it('response carries a per-file reason so failures are diagnosable, not opaque', async () => {
    const big = makeFile('huge.jpg', 'image/jpeg', MAX_BYTES + 1)
    const pdf = makeFile('quote.pdf', 'application/pdf') // wrong type for ticket-photos
    const res = await POST(formRequest(makeForm('ticket-photos', [big, pdf])))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.failed.sort()).toEqual(['huge.jpg', 'quote.pdf'])
    const byName = Object.fromEntries((body.errors as Array<{ name: string; reason: string }>).map((e) => [e.name, e.reason]))
    expect(byName['huge.jpg']).toMatch(/limit/i)
    expect(byName['quote.pdf']).toMatch(/unsupported/i)
  })

  it('a storage-layer error is surfaced with its reason in errors[]', async () => {
    H.state.uploadError = { message: 'Bucket not found' }
    const res = await POST(formRequest(makeForm('ticket-photos', [makeFile('a.jpg', 'image/jpeg')])))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.failed).toEqual(['a.jpg'])
    expect((body.errors as Array<{ name: string; reason: string }>)[0]).toMatchObject({ name: 'a.jpg', reason: 'Bucket not found' })
  })
})
