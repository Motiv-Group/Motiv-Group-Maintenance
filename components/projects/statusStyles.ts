// Shared status/stage styling for the Projects feature (client-safe — pure).
// Colours follow spec §18: grey Not Started · blue In Progress · red Overdue · green Complete.
import type { StoreStatus } from '@/lib/projects/progress'
import type { ProjectStatus } from '@/lib/projects/types'

export const STORE_STATUS_LABEL: Record<StoreStatus, string> = {
  not_started: 'Not Started',
  on_site: 'On Site',
  before_complete: 'Before Complete',
  after_complete: 'After Complete',
  complete: 'Complete',
}

/** Pill classes per store status. In-progress states share the blue tone. */
export const STORE_STATUS_PILL: Record<StoreStatus, string> = {
  not_started: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 ring-1 ring-slate-500/30',
  on_site: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30',
  before_complete: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30',
  after_complete: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30',
  complete: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30',
}

export const OVERDUE_PILL = 'bg-red-500/15 text-red-700 dark:text-red-400 ring-1 ring-red-500/30'

export const PROJECT_STATUS_PILL: Record<ProjectStatus, string> = {
  draft: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 ring-1 ring-slate-500/30',
  planned: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/30',
  active: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30',
  complete: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30',
  archived: 'bg-slate-500/10 text-slate-500 ring-1 ring-slate-500/20',
}

/** Progress-bar fill colour by percentage (complete=green, else blue, empty=grey). */
export function barColor(pct: number): string {
  if (pct >= 100) return '#10b981' // emerald
  if (pct <= 0) return '#94a3b8' // slate
  return '#2563eb' // blue
}
