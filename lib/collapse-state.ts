// Client-side persistence for collapsible section open/closed state. The user's
// choice (expand/collapse) is remembered across navigations and reloads, keyed by
// a stable section id so the preference is shared across every page that renders
// that section. Cleared on sign-in so each new session starts from the defaults.
const PREFIX = 'motiv:collapse:'

export function readCollapse(id: string): boolean | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(PREFIX + id)
    return v === null ? null : v === '1'
  } catch { return null }
}

export function writeCollapse(id: string, open: boolean): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(PREFIX + id, open ? '1' : '0') } catch { /* storage unavailable */ }
}

/** Read a remembered set of expanded keys (e.g. which store groups are open). */
export function readCollapseSet(id: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const v = window.localStorage.getItem(PREFIX + id)
    return v ? (JSON.parse(v) as string[]) : []
  } catch { return [] }
}

export function writeCollapseSet(id: string, keys: string[]): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(PREFIX + id, JSON.stringify(keys)) } catch { /* storage unavailable */ }
}

/** Wipe every remembered collapse state — call on sign-in to reset to defaults. */
export function clearCollapseState(): void {
  if (typeof window === 'undefined') return
  try {
    for (const k of Object.keys(window.localStorage)) if (k.startsWith(PREFIX)) window.localStorage.removeItem(k)
  } catch { /* storage unavailable */ }
}
