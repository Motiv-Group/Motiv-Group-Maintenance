'use client'

// Grouped ticket-filter badges shared by the SM / RM / Supplier Tickets tabs.
// Filters are organised into four intent groups — My actions (amber), Awaiting
// action (blue), Critical & overdue (red), Completed & closed (green) — each a
// coloured header + underline over a row of small count badges. The four groups
// spread across the full width (matching the distribution bar above). Clicking a
// badge toggles that filter; clicking the active one clears back to the default.
import type { ReactNode } from 'react'

export type FilterGroupTone = 'mine' | 'awaiting' | 'critical' | 'closed'
// `icon` is accepted for API compatibility with the callers but not rendered in
// the badge layout.
export type FilterTile = { key: string; label: string; count: number; icon?: ReactNode }
export type FilterGroup = { tone: FilterGroupTone; label: string; tiles: FilterTile[] }

const TONE: Record<FilterGroupTone, { header: string; bar: string; on: string; off: string }> = {
  mine:     { header: 'text-amber-700 dark:text-amber-400',     bar: 'bg-amber-500',   on: 'bg-amber-500 text-white',   off: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25' },
  awaiting: { header: 'text-blue-700 dark:text-blue-400',       bar: 'bg-blue-500',    on: 'bg-blue-500 text-white',    off: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 hover:bg-blue-500/25' },
  critical: { header: 'text-red-700 dark:text-red-400',         bar: 'bg-red-500',     on: 'bg-red-500 text-white',     off: 'bg-red-500/15 text-red-700 dark:text-red-400 hover:bg-red-500/25' },
  closed:   { header: 'text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-500', on: 'bg-emerald-500 text-white', off: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25' },
}

export function TicketFilterTiles({ groups, active, onPick }: {
  groups: FilterGroup[]
  active: string | null
  onPick: (key: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-4">
      {groups.map(g => {
        const tn = TONE[g.tone]
        return (
          <div key={g.tone} className="min-w-[150px] flex-1">
            <p className={`text-[10px] font-bold uppercase tracking-wide ${tn.header}`}>{g.label}</p>
            <div className={`mt-1 h-0.5 rounded-full ${tn.bar}`} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {g.tiles.map(t => {
                const on = active === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => onPick(t.key)}
                    aria-pressed={on}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${on ? tn.on : tn.off}`}
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
