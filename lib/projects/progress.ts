// Shared project-progress calculation — the ONE place completion math lives (spec §13).
// Pure functions, `now` injected for testability (mirrors lib/health/*). Store progress
// is derived from the four milestone timestamps (0/25/50/75/100), never a manually-typed
// value. Overall project progress = average of store percentages over the DERIVED store
// count (never hardcoded).

export const MILESTONES = ['on_site', 'before_photos', 'after_photos', 'signoff'] as const
export type Milestone = (typeof MILESTONES)[number]

export const MILESTONE_WEIGHT = 25 // each of the four milestones contributes 25%

export const MILESTONE_LABELS: Record<Milestone, string> = {
  on_site: 'On Site',
  before_photos: 'Before Photos',
  after_photos: 'After Photos',
  signoff: 'Sign-off',
}

/** The four milestone completion timestamps (null/undefined = not yet complete). */
export interface StoreMilestones {
  on_site_completed_at?: string | null
  before_photos_completed_at?: string | null
  after_photos_completed_at?: string | null
  signoff_completed_at?: string | null
}

/** A store row with the date fields the date-aware helpers need. */
export interface ProjectStoreLike extends StoreMilestones {
  start_date?: string | null
  end_date?: string | null
}

export type StoreStatus = 'not_started' | 'on_site' | 'before_complete' | 'after_complete' | 'complete'

/** How many of the four milestones are complete (0–4). */
export function completedMilestones(s: StoreMilestones): number {
  return (
    (s.on_site_completed_at ? 1 : 0) +
    (s.before_photos_completed_at ? 1 : 0) +
    (s.after_photos_completed_at ? 1 : 0) +
    (s.signoff_completed_at ? 1 : 0)
  )
}

/** Store completion percentage: 0 / 25 / 50 / 75 / 100. */
export function storeProgress(s: StoreMilestones): number {
  return completedMilestones(s) * MILESTONE_WEIGHT
}

/**
 * Overall project completion = Σ(store %) ÷ total store count.
 * The total is the number of project stores (derived from the import) — NOT a count of
 * fully-complete stores. Empty project → 0.
 */
export function projectProgress(stores: StoreMilestones[]): number {
  if (!stores.length) return 0
  const sum = stores.reduce((acc, s) => acc + storeProgress(s), 0)
  return sum / stores.length
}

/** projectProgress rounded to 1 decimal place, for display. */
export function projectProgressRounded(stores: StoreMilestones[]): number {
  return Math.round(projectProgress(stores) * 10) / 10
}

/** The next outstanding milestone (sequential), or null when the store is complete. */
export function currentMilestone(s: StoreMilestones): Milestone | null {
  if (!s.on_site_completed_at) return 'on_site'
  if (!s.before_photos_completed_at) return 'before_photos'
  if (!s.after_photos_completed_at) return 'after_photos'
  if (!s.signoff_completed_at) return 'signoff'
  return null
}

/** Store status keyed off completion count (maps 1:1 to 0/25/50/75/100 — spec §9). */
export function storeStatus(s: StoreMilestones): StoreStatus {
  switch (completedMilestones(s)) {
    case 0:
      return 'not_started'
    case 1:
      return 'on_site'
    case 2:
      return 'before_complete'
    case 3:
      return 'after_complete'
    default:
      return 'complete'
  }
}

/**
 * A store is overdue when its end date has fully PASSED and it is not yet 100%.
 * The end date is inclusive: a store due on the 19th is not overdue on the 19th,
 * only from the 20th onwards. `end_date` is a date-only string (YYYY-MM-DD) which
 * `new Date` parses to that day's UTC midnight (the START of the end date), so we
 * add one day and require `now` to have reached the day after.
 */
export function isOverdue(store: ProjectStoreLike, now: Date): boolean {
  if (storeProgress(store) >= 100) return false
  if (!store.end_date) return false
  const end = new Date(store.end_date)
  if (Number.isNaN(end.getTime())) return false
  const dayAfterEnd = end.getTime() + 24 * 60 * 60 * 1000
  return now.getTime() >= dayAfterEnd
}

/** Professional stage wording for a percentage (spec §5) — works for store or overall. */
export function stageLabel(progress: number): string {
  if (progress >= 100) return 'Complete'
  if (progress >= 75) return 'Nearing Completion'
  if (progress >= 50) return 'In Progress'
  if (progress >= 25) return 'Mobilisation'
  return 'Not Started'
}

/** The four milestones as ordered steps with done state — for segmented bars/steppers. */
export function milestoneSteps(s: StoreMilestones): { key: Milestone; label: string; done: boolean }[] {
  return [
    { key: 'on_site', label: MILESTONE_LABELS.on_site, done: !!s.on_site_completed_at },
    { key: 'before_photos', label: MILESTONE_LABELS.before_photos, done: !!s.before_photos_completed_at },
    { key: 'after_photos', label: MILESTONE_LABELS.after_photos, done: !!s.after_photos_completed_at },
    { key: 'signoff', label: MILESTONE_LABELS.signoff, done: !!s.signoff_completed_at },
  ]
}

/** Number of stores that have completed each milestone (for the funnel/summary row). */
export function milestoneCounts(stores: StoreMilestones[]): Record<Milestone, number> {
  return {
    on_site: stores.filter((s) => s.on_site_completed_at).length,
    before_photos: stores.filter((s) => s.before_photos_completed_at).length,
    after_photos: stores.filter((s) => s.after_photos_completed_at).length,
    signoff: stores.filter((s) => s.signoff_completed_at).length,
  }
}

export interface StatusBreakdown {
  total: number
  notStarted: number
  inProgress: number
  complete: number
  overdue: number
}

/** Summary-card counts. `overdue` overlaps in-progress/not-started (it's a warning flag). */
export function statusBreakdown(stores: ProjectStoreLike[], now: Date): StatusBreakdown {
  let notStarted = 0
  let inProgress = 0
  let complete = 0
  let overdue = 0
  for (const s of stores) {
    const p = storeProgress(s)
    if (p >= 100) complete++
    else if (p === 0) notStarted++
    else inProgress++
    if (isOverdue(s, now)) overdue++
  }
  return { total: stores.length, notStarted, inProgress, complete, overdue }
}
