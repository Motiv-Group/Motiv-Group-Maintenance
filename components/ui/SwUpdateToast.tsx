'use client'

/**
 * Unobtrusive "new version available" toast, shown by ServiceWorkerSetup when an
 * updated service worker is parked in the waiting state. Bottom-centre, floating
 * above the bottom tab nav (h-20) and clear of the safe-area inset, so it never
 * overlaps the nav or the notch. Presentational only — the parent owns SW state.
 */
export function SwUpdateToast({
  onRefresh,
  onDismiss,
}: {
  onRefresh: () => void
  onDismiss: () => void
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 z-50 flex justify-center px-4 pointer-events-none"
      // Sit above the fixed bottom nav (h-20 = 5rem) plus the safe-area inset.
      style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom) + 0.75rem)' }}
    >
      <div
        className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border px-4 py-3 shadow-lg"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
      >
        <span className="flex-1 text-sm leading-snug">A new version is available</span>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-700"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg leading-none hover:bg-[var(--hover)]"
          style={{ color: 'var(--text-muted)' }}
        >
          &times;
        </button>
      </div>
    </div>
  )
}
