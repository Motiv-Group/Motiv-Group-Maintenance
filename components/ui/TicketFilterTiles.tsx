'use client'

// Grouped ticket-filter tiles shared by the SM / RM / Supplier Tickets tabs.
// Filters are organised into four intent groups — My actions (amber), Awaiting
// action (blue), Critical & overdue (red), Completed & closed (green) — each a
// coloured header over a row of count+label+icon tiles. Clicking a tile toggles
// that filter; clicking the active one clears back to the default (all).
import type { ReactNode } from 'react'

export type FilterGroupTone = 'mine' | 'awaiting' | 'critical' | 'closed'
export type FilterTile = { key: string; label: string; count: number; icon: ReactNode }
export type FilterGroup = { tone: FilterGroupTone; label: string; tiles: FilterTile[] }

const TONE: Record<FilterGroupTone, { header: string; bar: string; border: string; count: string; icon: string; active: string }> = {
  mine:     { header: 'text-amber-700 dark:text-amber-400',   bar: 'bg-amber-500',   border: 'border-t-amber-500',   count: 'text-amber-600 dark:text-amber-400',   icon: 'text-amber-600 dark:text-amber-400',   active: 'ring-2 ring-amber-500/60 bg-amber-500/10' },
  awaiting: { header: 'text-blue-700 dark:text-blue-400',     bar: 'bg-blue-500',    border: 'border-t-blue-500',    count: 'text-blue-600 dark:text-blue-400',     icon: 'text-blue-600 dark:text-blue-400',     active: 'ring-2 ring-blue-500/60 bg-blue-500/10' },
  critical: { header: 'text-red-700 dark:text-red-400',       bar: 'bg-red-500',     border: 'border-t-red-500',     count: 'text-red-600 dark:text-red-400',       icon: 'text-red-600 dark:text-red-400',       active: 'ring-2 ring-red-500/60 bg-red-500/10' },
  closed:   { header: 'text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-500', border: 'border-t-emerald-500', count: 'text-emerald-600 dark:text-emerald-400', icon: 'text-emerald-600 dark:text-emerald-400', active: 'ring-2 ring-emerald-500/60 bg-emerald-500/10' },
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
          <div key={g.tone} className="min-w-0">
            <p className={`text-[10px] font-bold uppercase tracking-wide ${tn.header}`}>{g.label}</p>
            <div className={`mt-1 h-0.5 rounded-full ${tn.bar}`} />
            <div className="mt-2 flex flex-wrap gap-2">
              {g.tiles.map(t => {
                const on = active === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => onPick(t.key)}
                    aria-pressed={on}
                    className={`w-[116px] rounded-xl border-t-2 ${tn.border} bg-[var(--surface)] px-3 py-2.5 text-left ring-1 transition ${on ? tn.active : 'ring-[var(--border)] hover:bg-[var(--hover)]'}`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <span className={`text-xl font-bold leading-none tabular-nums ${tn.count}`}>{t.count}</span>
                      <span className={`shrink-0 ${tn.icon}`}>{t.icon}</span>
                    </div>
                    <div className="mt-1.5 truncate text-[11px] font-medium text-[var(--text-muted)]">{t.label}</div>
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
