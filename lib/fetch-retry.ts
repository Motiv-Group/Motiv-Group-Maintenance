import * as Sentry from '@sentry/nextjs'

/**
 * fetch with a hard timeout and bounded retry for transient failures.
 *
 * Semantics:
 * - Network errors / timeouts are retried (with short backoff); if the last
 *   attempt still fails, the error is captured to Sentry and re-thrown.
 * - HTTP 5xx / 429 responses are retried; other statuses (incl. 4xx) are
 *   returned immediately for the caller to handle (`res.ok` checks stay the
 *   caller's job — a 400 from a provider is not transient).
 * - Never retries more than `retries` times, so a non-idempotent POST is sent
 *   at most `retries + 1` times — keep retries at 1 for sends where a rare
 *   duplicate is acceptable, 0 where it isn't.
 *
 * Why: a hung dependency (Groq, Meta Graph) must not ride until the platform
 * kills the whole function — the user gets silence and the route does no
 * cleanup. A timeout turns that into a handled failure path.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; retries?: number; label?: string } = {},
): Promise<Response> {
  const { timeoutMs = 15_000, retries = 1, label = 'external' } = opts
  let lastError: unknown = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 500 * attempt))
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
      if ((res.status >= 500 || res.status === 429) && attempt < retries) {
        lastError = new Error(`[${label}] transient HTTP ${res.status}`)
        continue
      }
      return res
    } catch (err) {
      lastError = err
    }
  }

  const finalError = lastError instanceof Error ? lastError : new Error(`[${label}] failed`)
  // Best-effort telemetry — Sentry no-ops when the DSN is unset (dev).
  try {
    Sentry.captureException(finalError, { tags: { subsystem: 'external-fetch', label } })
  } catch { /* never let telemetry break the failure path */ }
  throw finalError
}
