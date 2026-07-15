'use client'

// The AI health briefing shown in the dashboard health heroes (SM / RM / supplier
// / executive). Inline we show a CONDENSED line — the first FULL sentence of the
// briefing — with a small "View insight" button that pops the full in-depth
// briefing, and a refresh control. Refresh regenerates and updates the text IN
// PLACE (the endpoint returns the fresh briefing) — it does NOT reload the page.
import { useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { DrawerHeader } from '@/components/exec/Drawer'
import type { BriefingScope } from '@/lib/briefing/facts'

const FALLBACK = 'Keep it up — everything is running smoothly.'

function firstSentence(s: string): string {
  const m = s.match(/^.*?[.!?](\s|$)/)
  return (m ? m[0] : s).trim()
}

export function AiBriefing({ headline: initHeadline, body: initBody, scope, scopeId, className = 'text-sm leading-relaxed text-[var(--text-muted)]' }: {
  headline?: string | null
  body?: string | null
  scope?: BriefingScope | null
  scopeId?: string | null
  className?: string
}) {
  const [headline, setHeadline] = useState<string | null>(initHeadline ?? null)
  const [body, setBody] = useState<string | null>(initBody ?? null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const full = (body ?? '').trim() || FALLBACK
  const condensed = firstSentence(full)
  const hasMore = full !== condensed

  async function refresh() {
    if (busy || !scope || !scopeId) return
    setBusy(true)
    try {
      const res = await fetch('/api/briefing/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, scopeId }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { setBody(typeof d.body === 'string' ? d.body : null); setHeadline(typeof d.headline === 'string' ? d.headline : null) }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className={className}>
        {/* Mobile: clamp to a short preview beside the donut. Web: full inline sentence. */}
        <span className="block line-clamp-2 sm:inline sm:line-clamp-none">{condensed}</span>
        {hasMore && (
          <>{' '}
            <button type="button" onClick={() => setOpen(true)}
              className="whitespace-nowrap text-xs font-medium text-[var(--text-faint)] underline underline-offset-2 transition hover:text-[var(--text-muted)]">
              View insight →
            </button>
          </>
        )}
        {scope && scopeId && (
          <>{' '}
            <button type="button" onClick={refresh} disabled={busy} aria-label="Refresh briefing" title="Refresh briefing"
              className="inline-flex translate-y-0.5 rounded p-0.5 text-[var(--text-faint)] transition hover:text-blue-500 disabled:opacity-60">
              <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
            </button>
          </>
        )}
      </p>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-lg">
          {close => (
            <>
              <DrawerHeader
                onClose={close}
                title={
                  <span className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-500/15 text-blue-500"><Sparkles size={15} /></span>
                    <span className="text-base font-bold text-[var(--text)]">AI insight</span>
                  </span>
                }
              />
              {headline && <p className="mb-2 text-sm font-semibold text-[var(--text)]">{headline}</p>}
              <p className="text-sm leading-relaxed text-[var(--text-muted)] whitespace-pre-line">{full}</p>
            </>
          )}
        </Modal>
      )}
    </>
  )
}
