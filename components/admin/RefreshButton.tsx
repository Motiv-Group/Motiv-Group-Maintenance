'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

/** Manual refresh for a server-rendered admin page. Calls router.refresh(),
 *  which re-runs the page's server component (re-fetching the provider) without
 *  a full navigation. On-load + manual refresh only — no background polling, so
 *  we never burn free-tier provider quota in the background. isPending stays
 *  true until the fresh RSC payload lands (no manual timer → no state update on
 *  an unmounted component). */
export function RefreshButton({ fetchedAt }: { fetchedAt?: string }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  const onClick = () => startTransition(() => router.refresh())

  return (
    <div className="flex items-center gap-2">
      {fetchedAt && (
        <span className="text-[11px] text-[var(--text-faint)] hidden sm:inline">
          Updated {new Date(fetchedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--text)] ring-1 ring-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--hover)] disabled:opacity-60 transition"
      >
        <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
        Refresh
      </button>
    </div>
  )
}
