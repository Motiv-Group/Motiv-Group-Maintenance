'use client'

// Four-segment store progress bar (On Site · Before · After · Sign-off). Completed
// segments are filled + ticked; incomplete are muted. Colour is never the only signal
// (icons + labels too) — spec §4/§18.
import { Check } from 'lucide-react'

export interface Step {
  key: string
  label: string
  done: boolean
}

export function SegmentedProgressBar({
  steps,
  showLabels = true,
  height = 'h-2.5',
  className = '',
}: {
  steps: Step[]
  showLabels?: boolean
  height?: string
  className?: string
}) {
  return (
    <div className={className}>
      <div className={`flex gap-1 ${height}`}>
        {steps.map((s) => (
          <div
            key={s.key}
            className={`flex-1 rounded-full transition-colors ${s.done ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-white/10'}`}
            title={`${s.label}: ${s.done ? 'complete' : 'outstanding'}`}
          />
        ))}
      </div>
      {showLabels && (
        <div className="mt-1.5 flex gap-1">
          {steps.map((s) => (
            <div
              key={s.key}
              className={`flex-1 flex items-center justify-center gap-1 text-[10px] font-medium ${
                s.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-faint)]'
              }`}
            >
              {s.done && <Check size={11} strokeWidth={3} />}
              <span className="truncate">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
