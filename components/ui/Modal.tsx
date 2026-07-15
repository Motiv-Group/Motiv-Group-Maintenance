'use client'

// Centered pop-up. Same API as SlideOver (onClose + a children(close) render
// prop) so it's a drop-in replacement — swap the import + tag. Fades/scales in,
// rendered in a portal on document.body with a high z-index, closes on backdrop
// click or Escape, and locks body scroll while open.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Modal({ onClose, children, maxWidth = 'max-w-lg' }: {
  onClose: () => void
  children: (close: () => void) => ReactNode
  maxWidth?: string
}) {
  const [mounted, setMounted] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const closing = useRef(false)

  function close() {
    if (closing.current) return
    closing.current = true
    setLeaving(true)
    setTimeout(onClose, 180)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only portal-mount gate; must run after mount so createPortal(document.body) never runs during SSR render
    setMounted(true)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!mounted) return null

  // The enter effect is a CSS keyframe (globals.css) that runs on the SAME paint as
  // mount — NOT a post-mount rAF state flip. That matters when the modal wraps a
  // heavy child (e.g. SendQuoteForm): the old approach painted the content at
  // opacity-0 and only revealed it after a second render, so a slow first mount left
  // just the underlying CTA button visible "for a while". Exit still transitions out.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className={`absolute inset-0 bg-black/50 ${leaving ? 'opacity-0 transition-opacity duration-200' : 'motion-safe:animate-[fadeIn_150ms_ease-out]'}`} onClick={close} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex max-h-[92vh] w-full ${maxWidth} flex-col space-y-4 overflow-y-auto rounded-t-2xl bg-[var(--surface)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] ring-1 sm:pb-5 ring-[var(--border)] shadow-2xl sm:rounded-2xl ${leaving ? 'translate-y-4 opacity-0 transition-all duration-200 sm:translate-y-0 sm:scale-95' : 'motion-safe:animate-[modalPop_200ms_ease-out]'}`}
      >
        {/* eslint-disable-next-line react-hooks/refs -- `close` reads closing.current from event/close handlers, never during render */}
        {children(close)}
      </div>
    </div>,
    document.body,
  )
}
