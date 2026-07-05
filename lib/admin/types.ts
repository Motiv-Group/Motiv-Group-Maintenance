// Shared types for the platform-admin infra dashboard (/admin/*).
// Every provider fetch returns a ProviderResult so the UI can render a
// consistent "configured / degraded / error" state without each page
// re-inventing the shape. All of this runs SERVER-SIDE only — provider
// secrets never reach the browser.

export type ProviderStatus = 'ok' | 'degraded' | 'unconfigured' | 'error'

export interface ProviderResult<T> {
  status: ProviderStatus
  /** Present when status is 'ok' or 'degraded'; null otherwise. */
  data: T | null
  /** Human-readable, safe-to-display message (never contains secrets). */
  message?: string
  /** Whether the required env vars for this provider are present. */
  configured: boolean
  /** ISO timestamp the data was fetched (for "last updated" display). */
  fetchedAt: string
}

export function ok<T>(data: T, message?: string): ProviderResult<T> {
  return { status: 'ok', data, message, configured: true, fetchedAt: new Date().toISOString() }
}
export function degraded<T>(data: T, message: string): ProviderResult<T> {
  return { status: 'degraded', data, message, configured: true, fetchedAt: new Date().toISOString() }
}
export function unconfigured<T>(message: string): ProviderResult<T> {
  return { status: 'unconfigured', data: null, message, configured: false, fetchedAt: new Date().toISOString() }
}
export function errored<T>(message: string): ProviderResult<T> {
  return { status: 'error', data: null, message, configured: true, fetchedAt: new Date().toISOString() }
}
