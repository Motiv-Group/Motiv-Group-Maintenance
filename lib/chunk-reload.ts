// After a deploy, a browser still showing the previous build references JS chunks
// that no longer exist. Navigating / lazy-loading then throws a "ChunkLoadError" /
// "module factory is not available" (Sentry sees these on e.g. /auth/login). They're
// transient — a fresh full load pulls the new chunks. The error boundaries call this
// to hard-reload ONCE (guarded against loops) so the user recovers seamlessly.
const CHUNK_ERROR = /ChunkLoadError|Loading chunk|module factory is not available|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i
const RELOAD_KEY = 'motiv:chunk-reloaded-at'

export function isChunkError(error: { name?: string; message?: string; digest?: string } | null | undefined): boolean {
  if (!error) return false
  return CHUNK_ERROR.test(`${error.name ?? ''} ${error.message ?? ''} ${error.digest ?? ''}`)
}

/** Reloads the page once when `error` is a stale-chunk error; returns whether it did. */
export function reloadIfChunkError(error: { name?: string; message?: string; digest?: string }): boolean {
  if (typeof window === 'undefined' || !isChunkError(error)) return false
  // Guard against reload loops: a genuinely broken chunk shouldn't reload forever.
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
  if (Date.now() - last <= 10_000) return false
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  window.location.reload()
  return true
}
