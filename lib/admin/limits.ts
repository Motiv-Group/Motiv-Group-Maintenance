// Free/hobby-tier ceilings, kept in one place so the infra dashboard can draw
// "usage vs limit" gauges and flag when we're close to a paid-tier cliff.
// These mirror docs/INFRASTRUCTURE_TIERS.md — update both together. Providers
// change limits over time; treat these as "last known" reference points.

export const FREE_LIMITS = {
  supabaseDbBytes:        500 * 1024 * 1024,   // 500 MB database
  supabaseStorageBytes:   1024 * 1024 * 1024,  // ~1 GB file storage
  supabaseMau:            50_000,              // monthly active users
  upstashCommandsPerDay:  10_000,             // ~10k commands/day
  resendPerMonth:         3_000,
  resendPerDay:           100,
  sentryEventsPerMonth:   5_000,
} as const

/** Human byte size, e.g. 1536 → "1.5 KB", 524288000 → "500 MB". */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v >= 10 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

/** Compact integer, e.g. 1234 → "1,234". */
export function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString('en-ZA')
}

/** Percentage of a limit used, clamped 0–100 (null-safe). */
export function pctOf(value: number | null | undefined, limit: number): number | null {
  if (value == null || !Number.isFinite(value) || limit <= 0) return null
  return Math.max(0, Math.min(100, Math.round((value / limit) * 100)))
}
