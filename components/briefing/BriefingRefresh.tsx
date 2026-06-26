'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import type { BriefingScope } from '@/lib/briefing/facts'

/** Small refresh control for the AI overview — clears today's cached briefing
 *  and re-renders so a fresh one is generated. */
export function BriefingRefresh({ scope, scopeId }: { scope: BriefingScope; scopeId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function refresh() {
    if (busy) return
    setBusy(true)
    try {
      await fetch('/api/briefing/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, scopeId }) })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" onClick={refresh} disabled={busy} aria-label="Refresh briefing" title="Refresh briefing"
      className="-m-1 p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[#C6A35D] hover:bg-[#C6A35D]/10 transition disabled:opacity-60">
      <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
    </button>
  )
}
