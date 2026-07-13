'use client'

// Grouped ticket-filter badges shared by the SM / RM / Supplier Tickets tabs.
// Filters are organised into four intent groups — My actions (amber), Awaiting
// action (blue), Critical & overdue (red), Completed & closed (green) — each a
// small coloured header + underline over a row of count badges. Groups spread
// across the full width and sit on one line on desktop. A tile can override its
// own tone (e.g. Cancelled/Declined use the grey "neutral" tone).
import type { ReactNode } from 'react'

export type FilterGroupTone = 'mine' | 'awaiting' | 'critical' | 'closed'
export type TileTone = FilterGroupTone | 'neutral'
// `icon` is accepted for API compatibility with the callers but not rendered in
// the badge layout. `tone` overrides the group tone for a single badge.
export type FilterTile = { key: string; label: string; count: number; icon?: ReactNode; tone?: TileTone }
export type FilterGroup = { tone: FilterGroupTone; label: string; tiles: FilterTile[] }

const TONE: Record<TileTone, { header: string; bar: string; on: string; off: string }> = {
  mine:     { header: 'text-amber-700 dark:text-amber-400',     bar: 'bg-amber-500',   on: 'bg-amber-500 text-white',   off: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25' },
  awaiting: { header: 'text-blue-700 dark:text-blue-400',       bar: 'bg-blue-500',    on: 'bg-blue-500 text-white',    off: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 hover:bg-blue-500/25' },
  critical: { header: 'text-red-700 dark:text-red-400',         bar: 'bg-red-500',     on: 'bg-red-500 text-white',     off: 'bg-red-500/15 text-red-700 dark:text-red-400 hover:bg-red-500/25' },
  closed:   { header: 'text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-500', on: 'bg-emerald-500 text-white', off: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25' },
  neutral:  { header: 'text-[var(--text-muted)]',               bar: 'bg-gray-400',    on: 'bg-gray-500 text-white',    off: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 hover:bg-gray-500/25' },
}

export function TicketFilterTiles({ groups, active, onPick }: {
  groups: FilterGroup[]
  active: string | null
  onPick: (key: string) => void
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      {groups.map(g => {
        const tn = TONE[g.tone]
        return (
          <div key={g.tone} className="min-w-0">
            <p className={`text-[9px] font-bold uppercase tracking-wide ${tn.header}`}>{g.label}</p>
            <div className={`mt-1 h-0.5 rounded-full ${tn.bar}`} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {g.tiles.map(t => {
                const tt = TONE[t.tone ?? g.tone]
                const on = active === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => onPick(t.key)}
                    aria-pressed={on}
                    className={`whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-semibold transition ${on ? tt.on : tt.off}`}
                  >
                    {t.label} <span className="tabular-nums opacity-70">{t.count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
