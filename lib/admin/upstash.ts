import 'server-only'
import { fetchJson } from './http'
import { ok, unconfigured, errored, type ProviderResult } from './types'

export interface UpstashStats {
  dbSize: number | null           // total keys in the Redis DB (DBSIZE)
  rateLimitKeys: number | null    // keys under our 'motiv-rl' prefix
  reachable: boolean
}

// One Upstash REST command: POST the command array to the REST URL.
async function cmd<T = any>(url: string, token: string, command: (string | number)[]) {
  return fetchJson<{ result: T }>(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
}

export async function getUpstashStats(): Promise<ProviderResult<UpstashStats>> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    return unconfigured('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to show distributed rate-limit activity. Without them, rate limiting falls back to weak per-instance counters.')
  }

  const dbSizeRes = await cmd<number>(url, token, ['DBSIZE'])
  if (!dbSizeRes.ok) {
    return errored(`Couldn't reach Upstash: ${dbSizeRes.error ?? 'unknown error'}.`)
  }
  const dbSize = typeof dbSizeRes.body?.result === 'number' ? dbSizeRes.body.result : null

  // Count rate-limit keys with a bounded SCAN loop (prefix 'motiv-rl', see
  // lib/rate-limit.ts). Cap iterations so a large DB can't stall the page.
  // DBSIZE already succeeded above, so Redis is reachable; `scanOk` tracks only
  // whether we could fully enumerate the keys (null count if not).
  let cursor = '0'
  let rlKeys = 0
  let scanOk = true
  for (let i = 0; i < 20; i++) {
    const scan = await cmd<[string, string[]]>(url, token, ['SCAN', cursor, 'MATCH', 'motiv-rl*', 'COUNT', 500])
    const tuple = scan.body?.result
    // Upstash SCAN returns [cursor, keys[]]; bail on any malformed response.
    if (!scan.ok || !Array.isArray(tuple) || typeof tuple[0] !== 'string' || !Array.isArray(tuple[1])) { scanOk = false; break }
    const [next, keys] = tuple
    rlKeys += keys.length
    cursor = next
    if (cursor === '0') break
  }

  return ok({ dbSize, rateLimitKeys: scanOk ? rlKeys : null, reachable: true })
}
