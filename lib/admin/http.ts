import 'server-only'

/** GET/POST JSON with a hard timeout so a slow provider never hangs the page
 *  render. Always no-store — the admin dashboard must show live data. Returns
 *  the parsed body plus the HTTP status; never throws (returns ok:false). */
export async function fetchJson<T = any>(
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
      const msg = (body as any)?.error?.message || (body as any)?.message || `HTTP ${res.status}`
      return { ok: false, status: res.status, body, error: String(msg) }
    }
    return { ok: true, status: res.status, body }
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? `Timed out after ${timeoutMs}ms` : (e?.message ?? 'Network error')
    return { ok: false, status: 0, body: null, error: String(msg) }
  } finally {
    clearTimeout(timer)
  }
}
