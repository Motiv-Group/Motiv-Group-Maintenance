'use client'

import { Star } from 'lucide-react'

/** Read-only star rating display (avg out of 5, optional count). Each star fills
 *  proportionally to the decimal — e.g. 4.3 shows four full stars and a 30% fifth. */
export function Stars({ value, count, size = 14, showNumber = true }: { value: number; count?: number; size?: number; showNumber?: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map(i => {
        const frac = Math.max(0, Math.min(1, value - i))   // 0..1 fill for this star
        return (
          <span key={i} className="relative inline-block leading-none" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 text-[var(--text-faint)]" />
            {frac > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${frac * 100}%` }}>
                <Star size={size} className="text-amber-400 fill-amber-400" />
              </span>
            )}
          </span>
        )
      })}
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
