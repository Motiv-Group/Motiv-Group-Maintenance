import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// ─── Distributed limiter (Upstash Redis) ─────────────────────────────────────
// In-memory limiting is per-instance, so on Vercel's serverless fleet each cold
// instance has its own counter and the effective limit is multiplied by the
// instance count. When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set
// we use a shared Redis sliding window so the limit is global. Without those env
// vars we fall back to the in-memory limiter below (fine for local/dev).
const redisUrl = process.env.UPSTASH_REDIS_REST_URL
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null

// One Ratelimit per (limit, window) combination — the window is baked into the
// instance, and our call sites use a handful of fixed configs.
const limiters = new Map<string, Ratelimit>()
function getLimiter(limit: number, windowMs: number): Ratelimit | null {
  if (!redis) return null
  const cacheKey = `${limit}:${windowMs}`
  let rl = limiters.get(cacheKey)
  if (!rl) {
    rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms` as `${number} ms`),
      prefix: 'motiv-rl',
      analytics: false,
    })
    limiters.set(cacheKey, rl)
  }
  return rl
}

// ─── In-memory fallback ──────────────────────────────────────────────────────
const store = new Map<string, { count: number; resetAt: number }>()

let lastSweep = Date.now()
const SWEEP_INTERVAL_MS = 5 * 60_000

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  store.forEach((entry, key) => {
    if (now > entry.resetAt) store.delete(key)
  })
}

function rateLimitMemory(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  sweep(now)
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false

  entry.count++
  return true
}

/**
 * Rate limit `key` to `limit` requests per `windowMs`.
 * Returns true if the request is allowed, false if it should be blocked.
 * Uses Upstash Redis when configured (global across instances), otherwise an
 * in-memory per-instance counter. Now async — call sites must `await` it.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const rl = getLimiter(limit, windowMs)
  if (rl) {
    try {
      const { success } = await rl.limit(key)
      return success
    } catch (e) {
      // Never let a Redis outage take down writes — degrade to in-memory.
      console.error('[rate-limit] Upstash error, falling back to in-memory', e)
    }
  }
  return rateLimitMemory(key, limit, windowMs)
}
