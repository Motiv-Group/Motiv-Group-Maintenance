'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Info } from 'lucide-react'

/** Small info icon that reveals an explanatory popover on hover (desktop) and
 *  tap (mobile). Pure CSS + state — no tooltip library. Colours come from the
 *  theme CSS vars so it reads in light and dark. Use it next to any metric or
 *  section heading to explain "what am I looking at and why does it matter". */
export function InfoTip({
  title, children, size = 13, align = 'center',
}: { title?: string; children: ReactNode; size?: number; align?: 'left' | 'center' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const pos = align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'

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
        className="text-[var(--text-faint)] hover:text-[#C6A35D] focus:text-[#C6A35D] transition-colors focus:outline-none"
      >
        <Info size={size} />
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute z-50 top-full mt-1.5 w-60 sm:w-64 max-w-[calc(100vw-1.5rem)] ${pos} rounded-lg bg-[var(--surface)] ring-1 ring-[var(--border)] shadow-lg dark:shadow-black/40 p-2.5 text-left normal-case font-normal`}
        >
          {title && <span className="block text-[11px] font-bold text-[var(--text)] mb-1">{title}</span>}
          <span className="block text-[11px] leading-relaxed text-[var(--text-muted)]">{children}</span>
        </span>
      )}
    </span>
  )
}
