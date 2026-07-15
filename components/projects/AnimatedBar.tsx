'use client'

// Large overall-completion bar that animates from 0 → pct on mount (spec §5 "large
// animated completion bar", "clearly show movement from 0% to 100%").
import { useEffect, useState } from 'react'
import { barColor } from './statusStyles'

export function AnimatedBar({
  pct,
  label = 'Overall Project Completion',
  stage,
  height = 16,
}: {
  pct: number
  label?: string
  stage?: string
  height?: number
}) {
  const [w, setW] = useState(0)
  useEffect(() => {
    // Next paint → CSS width transition runs from 0 to pct.
    const t = setTimeout(() => setW(Math.max(0, Math.min(100, pct))), 60)
    return () => clearTimeout(t)
  }, [pct])

  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
        <span className="flex items-baseline gap-2">
          {/* Stage word is sm+ — the uppercase label + % already fill a phone row. */}
          {stage && <span className="hidden text-xs font-medium text-[var(--text-muted)] sm:inline">{stage}</span>}
          <span className="text-xl font-bold tabular-nums text-[var(--text)] sm:text-2xl">{pct}%</span>
        </span>
      </div>
      <div className="w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden" style={{ height }}>
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-out"
          style={{ width: `${w}%`, background: barColor(pct) }}
        />
      </div>
    </div>
  )
}
