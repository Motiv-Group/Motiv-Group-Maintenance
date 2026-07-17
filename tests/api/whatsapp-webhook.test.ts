import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

// ---------------------------------------------------------------------------
// Endpoint tests for /api/webhooks/whatsapp (Meta Cloud API webhook):
//   • GET  — hub verify handshake (correct verify token echoes hub.challenge).
//   • POST — x-hub-signature-256 HMAC enforcement over the RAW body, including
//     the fail-CLOSED behaviour when WHATSAPP_APP_SECRET is unset in production
//     (audit HIGH 3) and fail-open outside production (dev convenience).
//   • POST — a validly-signed non-message payload (status update) is ACKed 200
//     with no side effects (no Supabase client, no outbound network).
//
// The module reads its env vars at import time, so every test (re)loads the
// route via vi.resetModules() + dynamic import AFTER vi.stubEnv. All network
// paths (Groq, Meta media/messages) are mocked so nothing leaves the process.
// ---------------------------------------------------------------------------

const H = vi.hoisted(() => ({
  // Recorded so tests can assert the handler took NO action for non-message payloads.
  createAdminClient: vi.fn(() => ({
    from: () => { throw new Error('DB access not expected in these tests') },
    storage: { from: () => { throw new Error('storage not expected') } },
    rpc: () => { throw new Error('rpc not expected') },
  })),
  fetchWithRetry: vi.fn(async () => { throw new Error('network disabled in tests (fetchWithRetry)') }),
  sendPushToMany: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({}),
  createAdminClient: H.createAdminClient,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/push', () => ({ sendPushToMany: H.sendPushToMany, sendPushToUser: () => {} }))
vi.mock('@/lib/briefing/generate', () => ({ getBriefingForUser: async () => null }))
vi.mock('@/lib/briefing/facts', () => ({ briefingToText: () => '' }))
// All Groq/Meta HTTP goes through fetchWithRetry — mock it so nothing hits the network.
vi.mock('@/lib/fetch-retry', () => ({ fetchWithRetry: H.fetchWithRetry }))

const APP_SECRET = 'test-app-secret'
const VERIFY_TOKEN = 'test-verify-token'

type RouteModule = typeof import('@/app/api/webhooks/whatsapp/route')

/**
 * Load a FRESH copy of the route with the given env. The module captures
 * WHATSAPP_* env vars in top-level consts, so stubbing must happen before the
 * (dynamic) import and the module registry must be reset between scenarios.
 */
async function loadRoute(env: { appSecret?: string; verifyToken?: string; nodeEnv?: string } = {}): Promise<RouteModule> {
  vi.resetModules()
  vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-wa-token')
  vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '1234567890')
  vi.stubEnv('GROQ_API_KEY', 'test-groq-key')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('WHATSAPP_APP_SECRET', env.appSecret)     // undefined ⇒ unset
  vi.stubEnv('WHATSAPP_VERIFY_TOKEN', env.verifyToken) // undefined ⇒ unset
  if (env.nodeEnv) vi.stubEnv('NODE_ENV', env.nodeEnv)
  return await import('@/app/api/webhooks/whatsapp/route')
}

function verifyRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/webhooks/whatsapp')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

function postRequest(rawBody: string, signature?: string): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/whatsapp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature !== undefined ? { 'x-hub-signature-256': signature } : {}),
    },
    body: rawBody,
  })
}

/** Real HMAC — exactly what Meta computes over the raw body bytes. */
function sign(rawBody: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
}

// A well-formed webhook delivery that contains NO messages (e.g. a message
// status update) — must be ACKed 200 and produce no side effects.
const NON_MESSAGE_PAYLOAD = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: { metadata: { phone_number_id: '1234567890' }, statuses: [{ id: 'wamid.X', status: 'delivered' }] } }] }],
})

beforeEach(() => {
  H.createAdminClient.mockClear()
  H.fetchWithRetry.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ===========================================================================
// GET — Meta webhook verification handshake
// ===========================================================================
describe('GET /api/webhooks/whatsapp — verify handshake', () => {
  it('correct verify token echoes hub.challenge with 200', async () => {
    const { GET } = await loadRoute({ verifyToken: VERIFY_TOKEN })
    const res = await GET(verifyRequest({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'CHALLENGE-42' }))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('CHALLENGE-42')
  })

  it('wrong verify token → 403 (no challenge leaked)', async () => {
    const { GET } = await loadRoute({ verifyToken: VERIFY_TOKEN })
    const res = await GET(verifyRequest({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'CHALLENGE-42' }))
    expect(res.status).toBe(403)
    expect(await res.text()).not.toContain('CHALLENGE-42')
  })

  it('wrong hub.mode → 403 even with the correct token', async () => {
    const { GET } = await loadRoute({ verifyToken: VERIFY_TOKEN })
    const res = await GET(verifyRequest({ 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'CHALLENGE-42' }))
    expect(res.status).toBe(403)
  })

  it('WHATSAPP_VERIFY_TOKEN unset → 403 (handshake cannot succeed by default)', async () => {
    const { GET } = await loadRoute({ verifyToken: undefined })
    const res = await GET(verifyRequest({ 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': 'CHALLENGE-42' }))
    expect(res.status).toBe(403)
  })
})

// ===========================================================================
// POST — x-hub-signature-256 enforcement (secret configured)
// ===========================================================================
describe('POST /api/webhooks/whatsapp — signature enforcement with secret set', () => {
  it('missing x-hub-signature-256 header → 403', async () => {
    const { POST } = await loadRoute({ appSecret: APP_SECRET, nodeEnv: 'production' })
    const res = await POST(postRequest(NON_MESSAGE_PAYLOAD))
    expect(res.status).toBe(403)
  })

  it('garbage signature → 403', async () => {
    const { POST } = await loadRoute({ appSecret: APP_SECRET, nodeEnv: 'production' })
    const res = await POST(postRequest(NON_MESSAGE_PAYLOAD, 'sha256=' + 'ab'.repeat(32)))
    expect(res.status).toBe(403)
  })

  it('signature computed with the WRONG secret → 403', async () => {
    const { POST } = await loadRoute({ appSecret: APP_SECRET, nodeEnv: 'production' })
    const res = await POST(postRequest(NON_MESSAGE_PAYLOAD, sign(NON_MESSAGE_PAYLOAD, 'some-other-secret')))
    expect(res.status).toBe(403)
  })

  it('valid signature over a DIFFERENT body (tampered payload) → 403', async () => {
    const { POST } = await loadRoute({ appSecret: APP_SECRET, nodeEnv: 'production' })
    const res = await POST(postRequest(NON_MESSAGE_PAYLOAD, sign('{"object":"tampered"}', APP_SECRET)))
    expect(res.status).toBe(403)
  })

  it('valid HMAC over the raw body → accepted (200 ok)', async () => {
    const { POST } = await loadRoute({ appSecret: APP_SECRET, nodeEnv: 'production' })
    const res = await POST(postRequest(NON_MESSAGE_PAYLOAD, sign(NON_MESSAGE_PAYLOAD, APP_SECRET)))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('valid signature but malformed JSON body → 400', async () => {
    const raw = '{not json'
    const { POST } = await loadRoute({ appSecret: APP_SECRET, nodeEnv: 'production' })
    const res = await POST(postRequest(raw, sign(raw, APP_SECRET)))
    expect(res.status).toBe(400)
  })
})

// ===========================================================================
// POST — secret NOT configured: fail-closed in production, fail-open in dev
// ===========================================================================
describe('POST /api/webhooks/whatsapp — WHATSAPP_APP_SECRET unset', () => {
  it('production: rejected 403 (fail-closed) with no signature', async () => {
    const { POST } = await loadRoute({ appSecret: undefined, nodeEnv: 'production' })
    const res = await POST(postRequest(NON_MESSAGE_PAYLOAD))
    expect(res.status).toBe(403)
  })

  it('production: rejected 403 even when the caller supplies a signature header', async () => {
    const { POST } = await loadRoute({ appSecret: undefined, nodeEnv: 'production' })
    const res = await POST(postRequest(NON_MESSAGE_PAYLOAD, sign(NON_MESSAGE_PAYLOAD, 'anything')))
    expect(res.status).toBe(403)
  })

  it('non-production (dev/test): fail-open 200 so local dev keeps working', async () => {
    const { POST } = await loadRoute({ appSecret: undefined }) // NODE_ENV stays "test"
    const res = await POST(postRequest(NON_MESSAGE_PAYLOAD))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})

// ===========================================================================
// POST — non-message payload is ACKed with NO side effects
// ===========================================================================
describe('POST /api/webhooks/whatsapp — non-message payload has no side effects', () => {
  it('status-update payload: 200 ok, no Supabase client, no outbound network', async () => {
    const { POST } = await loadRoute({ appSecret: APP_SECRET, nodeEnv: 'production' })
    const res = await POST(postRequest(NON_MESSAGE_PAYLOAD, sign(NON_MESSAGE_PAYLOAD, APP_SECRET)))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
    expect(H.createAdminClient).not.toHaveBeenCalled()
    expect(H.fetchWithRetry).not.toHaveBeenCalled()
    expect(H.sendPushToMany).not.toHaveBeenCalled()
  })

  it('empty entry array: still ACKed 200 with no side effects', async () => {
    const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
    const { POST } = await loadRoute({ appSecret: APP_SECRET, nodeEnv: 'production' })
    const res = await POST(postRequest(raw, sign(raw, APP_SECRET)))
    expect(res.status).toBe(200)
    expect(H.createAdminClient).not.toHaveBeenCalled()
    expect(H.fetchWithRetry).not.toHaveBeenCalled()
  })
})
