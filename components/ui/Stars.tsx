'use client'

import { Star } from 'lucide-react'

/** Read-only star rating display (avg out of 5, optional count). */
export function Stars({ value, count, size = 14, showNumber = true }: { value: number; count?: number; size?: number; showNumber?: boolean }) {
  const full = Math.round(value)
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} className={i <= full ? 'text-amber-400 fill-amber-400' : 'text-[var(--text-faint)]'} />
      ))}
      {showNumber && value > 0 && <span className="text-[11px] text-[var(--text-muted)] ml-1">{value.toFixed(1)}{count ? ` (${count})` : ''}</span>}
    </span>
  )
}

/** Interactive 1–5 star picker. */
export function StarInput({ value, onChange, size = 26 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" onClick={() => onChange(i)} aria-label={`${i} star${i > 1 ? 's' : ''}`}
          className="p-0.5 transition hover:scale-110">
          <Star size={size} className={i <= value ? 'text-amber-400 fill-amber-400' : 'text-[var(--text-faint)] hover:text-amber-300'} />
        </button>
      ))}
    </div>
  )
}
