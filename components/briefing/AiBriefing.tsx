'use client'

// The AI health briefing shown in the dashboard health heroes (SM / RM / supplier
// / executive). Inline we show a CONDENSED line — the AI headline if there is one,
// otherwise the first sentence — with a small grey "View more insight" button that
// pops up the full in-depth briefing.
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { DrawerHeader } from '@/components/exec/Drawer'

const FALLBACK = 'Keep it up — everything is running smoothly.'

function firstSentence(s: string): string {
  const m = s.match(/^.*?[.!?](\s|$)/)
  return (m ? m[0] : s).trim()
}

export function AiBriefing({ headline, body, className = 'text-sm leading-relaxed text-[var(--text-muted)]' }: {
  headline?: string | null
  body?: string | null
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const full = (body ?? '').trim() || FALLBACK
  const condensed = (headline ?? '').trim() || firstSentence(full)
  const hasMore = full !== condensed

  return (
    <>
      <p className={className}>
        {condensed}
        {hasMore && (
          <>{' '}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="whitespace-nowrap text-xs font-medium text-[var(--text-faint)] underline underline-offset-2 transition hover:text-[var(--text-muted)]"
            >
              View insight →
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
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#C6A35D]/15 text-[#C6A35D]"><Sparkles size={15} /></span>
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
