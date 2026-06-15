const store = new Map<string, { count: number; resetAt: number }>()

/**
 * Simple in-memory rate limiter.
 * Returns true if the request is allowed, false if it should be blocked.
 * Note: resets across server restarts and won't work across multiple instances.
 */
// Sweep expired entries periodically so the map can't grow unbounded
// on a long-lived instance.
let lastSweep = Date.now()
const SWEEP_INTERVAL_MS = 5 * 60_000

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  store.forEach((entry, key) => {
    if (now > entry.resetAt) store.delete(key)
  })
}

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
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
