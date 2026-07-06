import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import * as Sentry from '@sentry/nextjs'

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

// ─── Fallback alerting (B9) ──────────────────────────────────────────────────
// When we drop to the per-instance in-memory limiter in production the global
// limit is silently weaker, so we surface it to Sentry. Sentry.captureException
// no-ops when NEXT_PUBLIC_SENTRY_DSN is unset, so this is safe in dev/local.
// Throttled per-process: a sustained Upstash outage would otherwise fire on every
// request and burn the free-tier event budget (spike protection is also on).
const ALERT_THROTTLE_MS = 5 * 60_000
let lastAlertAt = 0

function alertFallback(reason: 'upstash_outage' | 'upstash_unconfigured', err?: unknown) {
  const now = Date.now()
  if (now - lastAlertAt < ALERT_THROTTLE_MS) return
  lastAlertAt = now
  const ctx = {
    level: 'error' as const,
    tags: { subsystem: 'rate-limit', fallback: 'in-memory', reason },
  }
  if (err !== undefined) {
    Sentry.captureException(err, ctx)
  } else {
    Sentry.captureMessage(
      '[rate-limit] Upstash not configured in production — using per-instance in-memory limiter (global limit is weaker)',
      ctx,
    )
  }
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
      alertFallback('upstash_outage', e)
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Redis unconfigured in prod → per-instance limiter. Should never happen once
    // UPSTASH_REDIS_* is set; alert so the weaker limit isn't silent.
    alertFallback('upstash_unconfigured')
  }
  return rateLimitMemory(key, limit, windowMs)
}
