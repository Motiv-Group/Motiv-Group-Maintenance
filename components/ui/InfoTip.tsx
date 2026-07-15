'use client'

import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react'
import { Info } from 'lucide-react'

// Run before paint on the client (measure/reposition without a visible jump);
// fall back to useEffect during SSR so React doesn't warn.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/** Small info icon that reveals an explanatory popover on hover (desktop) and
 *  tap (mobile). Pure CSS + state — no tooltip library. Colours come from the
 *  theme CSS vars so it reads in light and dark. Use it next to any metric or
 *  section heading to explain "what am I looking at and why does it matter". */
export function InfoTip({
  title, children, size = 13, align = 'center',
}: { title?: string; children: ReactNode; size?: number; align?: 'left' | 'center' | 'right' }) {
  const [open, setOpen] = useState(false)
  const [shift, setShift] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  // Keep the popover inside the viewport on narrow screens so a tile near an
  // edge (e.g. a right-column StatTile on a 375px phone) can't push the page
  // into a horizontal scroll. A no-op when it already fits, so wider/desktop
  // layouts render identically.
  useIsoLayoutEffect(() => {
    if (!open) { setShift(0); return }
    const el = tipRef.current
    if (!el) return
    const margin = 8
    const r = el.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    let dx = 0
    if (r.left < margin) dx = margin - r.left
    else if (r.right > vw - margin) dx = (vw - margin) - r.right
    setShift(dx)
  }, [open])

  const pos = align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'
  // translateX in absolute px keeps the clamp direction consistent across every
  // align mode; the -50% preserves the centred default when shift is 0.
  const tx = `translateX(calc(${align === 'center' ? '-50%' : '0px'} + ${shift}px))`

  return (
    <span
      ref={ref}
      className="relative inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={title ? `Info: ${title}` : 'More information'}
        aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o) }}
        className="text-[var(--text-faint)] hover:text-blue-600 dark:hover:text-blue-400 focus:text-blue-600 dark:focus:text-blue-400 transition-colors focus:outline-none"
      >
        <Info size={size} />
      </button>
      {open && (
        <span
          ref={tipRef}
          role="tooltip"
          style={{ transform: tx }}
          className={`absolute z-50 top-full mt-1.5 w-60 sm:w-64 max-w-[calc(100vw-1.5rem)] ${pos} rounded-lg bg-[var(--surface)] ring-1 ring-[var(--border)] shadow-lg dark:shadow-black/40 p-2.5 text-left normal-case font-normal`}
        >
          {title && <span className="block text-[11px] font-bold text-[var(--text)] mb-1">{title}</span>}
          <span className="block text-[11px] leading-relaxed text-[var(--text-muted)]">{children}</span>
        </span>
      )}
    </span>
  )
}
