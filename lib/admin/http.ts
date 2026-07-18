import 'server-only'

/** GET/POST JSON with a hard timeout so a slow provider never hangs the page
 *  render. Always no-store — the admin dashboard must show live data. Returns
 *  the parsed body plus the HTTP status; never throws (returns ok:false). */
export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<{ ok: boolean; status: number; body: T | null; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, cache: 'no-store', signal: controller.signal })
    let body: T | null = null
    try { body = (await res.json()) as T } catch { /* non-JSON body */ }
    if (!res.ok) {
      // Providers put their error text in either {error:{message}} or {message}.
      const b = body as { error?: { message?: unknown }; message?: unknown } | null
      const msg = b?.error?.message || b?.message || `HTTP ${res.status}`
      return { ok: false, status: res.status, body, error: String(msg) }
    }
    return { ok: true, status: res.status, body }
  } catch (e) {
    const err = e as { name?: unknown; message?: unknown } | null | undefined // fetch abort/network errors
    const msg = err?.name === 'AbortError' ? `Timed out after ${timeoutMs}ms` : (err?.message ?? 'Network error')
    return { ok: false, status: 0, body: null, error: String(msg) }
  } finally {
    clearTimeout(timer)
  }
}
