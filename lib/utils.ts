import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Priority, TicketStatus, QuoteStatus } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  low:    'bg-green-100  text-green-700  dark:bg-green-950  dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
  high:   'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
  urgent: 'bg-red-100    text-red-700    dark:bg-red-950    dark:text-red-400',
}

// Urgency rank shared by the tickets tabs (handles classic low/medium/high/urgent
// and the health-engine P1–P4 codes). 0 = most urgent.
const URGENCY_RANK: Record<string, number> = { urgent: 0, P1: 0, high: 1, P2: 1, medium: 2, P3: 2, low: 3, P4: 3 }

// Solid colour for a ticket-group's count circle, tinted by its most urgent ticket
// so the busiest groups stand out. Urgent → red, High → orange, Medium/Low → yellow
// (low folds into the medium band, so every live group still shows a colour). No
// live tickets → the neutral grey badge. Used by every role's Tickets tab.
export function urgencyCountCls(priorities: (string | null | undefined)[]): string {
  let best = 99
  for (const p of priorities) { const r = URGENCY_RANK[p ?? ''] ?? 99; if (r < best) best = r }
  if (best === 0) return 'bg-red-500 text-white'
  if (best === 1) return 'bg-orange-500 text-white'
  if (best <= 3) return 'bg-yellow-500 text-[#0a0e17]'
  return 'text-[var(--text-muted)] bg-black/5 dark:bg-white/10'
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open:        'New',
  info_requested:   'Info Requested',
  assigned:         'Assigned',
  assessment:       'Assessment',
  quote_requested:  'Quote Requested',
  quoted:      'Quote Sent',
  quote_revision:   'Quote Revision',
  accepted:    'Instruction to Proceed',
  scheduled:        'Scheduled',
  in_progress: 'In Progress',
  variation_review: 'Variation Review',
  vo_declined:      'VO Declined',
  submitted_for_signoff: 'Pending Sign-off',
  evidence_requested:    'Evidence Requested',
  snag:             'Snag',
  snag_assigned:    'Snag Scheduled',
  snag_resolved:    'Snag Resolved',
  approved_closeout:'Approved for Close-Out',
  suppliers_declined: 'Declined (Supplier)',
  completed:   'Completed',
  cancelled:   'Cancelled',
  declined:    'Declined',
  // legacy
  pending_sign_off: 'Pending Sign-off',
  snag_in_progress: 'Snag Underway',
  variation_pending: 'Variation Pending',
  variation_accepted: 'Variation Accepted',
}

// One distinct hue per status, kept consistent across badges, bars and
// legends app-wide so no two statuses can be visually confused.
// 4-tone status colours (mirrors rmStatusMeta): blue = new / passive in-flight,
// amber = needs action now, red = snag / bad, green = completed, grey = closed.
export const STATUS_COLORS: Record<TicketStatus, string> = {
  open:             'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  info_requested:   'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  assigned:         'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  assessment:       'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  quote_requested:  'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  quoted:           'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  quote_revision:   'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  accepted:         'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  scheduled:        'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  in_progress:      'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  variation_review: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  vo_declined:      'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  submitted_for_signoff: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  evidence_requested:    'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  snag:             'bg-red-500/15 text-red-700 dark:text-red-400',
  snag_assigned:    'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  snag_resolved:    'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  approved_closeout:'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  suppliers_declined: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  completed:        'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  declined:         'bg-gray-500/15 text-gray-600 dark:text-gray-400',
  cancelled:        'bg-gray-500/15 text-gray-600 dark:text-gray-400',
  // legacy
  variation_pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  variation_accepted: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  pending_sign_off:  'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  snag_in_progress: 'bg-red-500/15 text-red-700 dark:text-red-400',
}

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  pending:  'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
}

// Operational impact — single source of truth for the labels shown on the
// log-ticket form, the ticket detail view and the store-manager search.
export const OPERATIONAL_IMPACT_LABELS: Record<string, string> = {
  none:                'No operational impact',
  cosmetic:            'Cosmetic / minor',
  customer_visible:    'Customer-visible',
  staff_inconvenience: 'Staff inconvenience',
  trading_affected:    'Trading affected',
  safety_risk:         'Safety risk',
  cannot_trade:        'Store cannot trade',
}

// Priority level labels — handles both the health engine's P1–P4 codes and the
// classic low/medium/high/urgent values, so search and detail views can render
// either representation. P1 = most urgent.
export const PRIORITY_LEVEL_LABELS: Record<string, string> = {
  P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low',
  urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low',
}

// Plain priority word (low / medium / high / urgent) from either the engine's
// P1–P4 codes or the classic words — for notification copy and chat messages
// that should never surface raw "P1" codes to users. P1 = urgent.
const PRIORITY_WORDS: Record<string, string> = {
  P1: 'urgent', P2: 'high', P3: 'medium', P4: 'low',
  urgent: 'urgent', high: 'high', medium: 'medium', low: 'low',
}
export function priorityWord(p?: string | null): string {
  return PRIORITY_WORDS[String(p)] ?? 'medium'
}

// Filter-pill colours per status — active (filled) + inactive (tinted outline),
// matching STATUS_COLORS hues so a filter reads like the status it selects.
// Reused by the ticket filter bars across regional / supplier / client pages.
export const STATUS_PILL: Record<TicketStatus, { active: string; inactive: string }> = {
  open:        { active: 'bg-blue-500 text-white border-blue-500',       inactive: 'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/40 hover:border-blue-400' },
  info_requested: { active: 'bg-slate-500 text-white border-slate-500',  inactive: 'text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400' },
  assigned:    { active: 'bg-teal-500 text-white border-teal-500',       inactive: 'text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900/40 hover:border-teal-400' },
  assessment:  { active: 'bg-cyan-500 text-white border-cyan-500',       inactive: 'text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-900/40 hover:border-cyan-400' },
  quote_requested: { active: 'bg-cyan-500 text-white border-cyan-500',   inactive: 'text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-900/40 hover:border-cyan-400' },
  quoted:      { active: 'bg-cyan-500 text-white border-cyan-500',       inactive: 'text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-900/40 hover:border-cyan-400' },
  quote_revision: { active: 'bg-amber-500 text-white border-amber-500',  inactive: 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/40 hover:border-amber-400' },
  accepted:    { active: 'bg-teal-500 text-white border-teal-500',       inactive: 'text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900/40 hover:border-teal-400' },
  scheduled:   { active: 'bg-indigo-500 text-white border-indigo-500',   inactive: 'text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/40 hover:border-indigo-400' },
  in_progress: { active: 'bg-amber-500 text-white border-amber-500',     inactive: 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/40 hover:border-amber-400' },
  variation_review: { active: 'bg-purple-500 text-white border-purple-500', inactive: 'text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/40 hover:border-purple-400' },
  vo_declined: { active: 'bg-red-500 text-white border-red-500',          inactive: 'text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/40 hover:border-red-400' },
  submitted_for_signoff: { active: 'bg-orange-500 text-white border-orange-500', inactive: 'text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-900/40 hover:border-orange-400' },
  evidence_requested: { active: 'bg-amber-500 text-white border-amber-500', inactive: 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/40 hover:border-amber-400' },
  snag:        { active: 'bg-red-500 text-white border-red-500',         inactive: 'text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/40 hover:border-red-400' },
  snag_assigned: { active: 'bg-pink-500 text-white border-pink-500',     inactive: 'text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-900/40 hover:border-pink-400' },
  snag_resolved: { active: 'bg-teal-500 text-white border-teal-500',     inactive: 'text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900/40 hover:border-teal-400' },
  approved_closeout: { active: 'bg-green-600 text-white border-green-600', inactive: 'text-green-600 dark:text-green-400 border-green-200 dark:border-green-900/40 hover:border-green-400' },
  suppliers_declined: { active: 'bg-red-600 text-white border-red-600',  inactive: 'text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/40 hover:border-red-400' },
  completed:   { active: 'bg-green-600 text-white border-green-600',     inactive: 'text-green-600 dark:text-green-400 border-green-200 dark:border-green-900/40 hover:border-green-400' },
  declined:    { active: 'bg-fuchsia-600 text-white border-fuchsia-600', inactive: 'text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-200 dark:border-fuchsia-900/40 hover:border-fuchsia-400' },
  cancelled:   { active: 'bg-gray-500 text-white border-gray-500',       inactive: 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400' },
  // legacy
  variation_pending: { active: 'bg-purple-500 text-white border-purple-500', inactive: 'text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/40 hover:border-purple-400' },
  variation_accepted: { active: 'bg-indigo-500 text-white border-indigo-500', inactive: 'text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/40 hover:border-indigo-400' },
  pending_sign_off:  { active: 'bg-orange-500 text-white border-orange-500', inactive: 'text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-900/40 hover:border-orange-400' },
  snag_in_progress: { active: 'bg-pink-500 text-white border-pink-500',  inactive: 'text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-900/40 hover:border-pink-400' },
}

export type ClientVisibleStatus = 'open' | 'info_requested' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

/**
 * Collapse the full ticket lifecycle into what a store manager / client is
 * allowed to see: Open → In Progress → Completed (+ Cancelled). Every
 * supplier/RM-side intermediate state (quoted, accepted, variation_pending,
 * pending_sign_off, snag, snag_in_progress, declined) reads as 'open' so the
 * ticket never disappears from their view. Cancelled is shown explicitly.
 */
const CLIENT_IN_PROGRESS = new Set<TicketStatus>([
  'in_progress', 'variation_review', 'variation_accepted',
  'submitted_for_signoff', 'evidence_requested', 'snag', 'snag_assigned', 'snag_resolved',
  'approved_closeout', 'pending_sign_off', 'snag_in_progress',
])
// "Job scheduled" = approved/scheduled but not yet started — the SM's own step
// between Open and In Progress; In Progress begins when the supplier starts work.
// vo_declined sits in the scheduled phase (VOs are handled before work starts).
const CLIENT_SCHEDULED = new Set<TicketStatus>(['accepted', 'scheduled', 'vo_declined'])
export function clientVisibleStatus(status: TicketStatus): ClientVisibleStatus | null {
  if (status === 'cancelled')  return 'cancelled'
  if (status === 'completed')  return 'completed'
  if (status === 'info_requested') return 'info_requested'
  if (CLIENT_SCHEDULED.has(status)) return 'scheduled'
  if (CLIENT_IN_PROGRESS.has(status)) return 'in_progress'
  return 'open'
}

/** Store display label that avoids "Mall — Mall" when name === sub_store. */
export function storeLabel(name?: string | null, subStore?: string | null): string {
  const n = (name ?? '').trim()
  const s = (subStore ?? '').trim()
  if (s && s !== n) return `${n} — ${s}`
  return n || s || 'Store'
}

/**
 * Auto-compose a ticket title from category + the description's opening words:
 * "Refrigeration — fridge by bakery leaking wat…". Store staff never type a
 * title (free text invites nonsense from rushed/low-literacy users — that's why
 * title used to just BE the category), but bare categories made lists
 * unscannable. The description is already required, so its first words carry
 * the distinguishing signal for free. Word-boundary trimmed to ~maxLen.
 */
export function composeTicketTitle(category: string | null | undefined, description: string | null | undefined, maxLen = 64): string {
  const cat = (category ?? 'General').trim() || 'General'
  const desc = (description ?? '').replace(/\s+/g, ' ').trim()
  if (!desc) return cat
  const budget = maxLen - cat.length - 3 // " — "
  if (budget < 8) return cat
  if (desc.length <= budget) return `${cat} — ${desc}`
  const cut = desc.slice(0, budget)
  const atWord = cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut
  return `${cat} — ${atWord}…`
}

/**
 * Condensed-but-accurate ticket status for RM views (recent card, tickets tab,
 * ticket page). Unlike clientVisibleStatus (3-state, for the SM), this reflects
 * the commercial/execution phase so the overview updates as the ticket moves.
 */
export function rmStatusMeta(status: string): { label: string; cls: string; text: string } {
  // 4-tone status language (shared with clientStatusBadgeClass, the filter pills and
  // the distribution bars): BLUE = new / passive-in-flight (waiting on someone else),
  // AMBER = needs the manager's action now, RED = snag / bad, GREEN = completed,
  // GREY = cancelled / declined.
  const blueT = 'text-blue-700 dark:text-blue-400', amberT = 'text-amber-700 dark:text-amber-400'
  const redT = 'text-red-700 dark:text-red-400', greenT = 'text-emerald-700 dark:text-emerald-400', grayT = 'text-gray-600 dark:text-gray-400'
  const blue = `bg-blue-500/15 ${blueT}`, amber = `bg-amber-500/15 ${amberT}`, red = `bg-red-500/15 ${redT}`, green = `bg-emerald-500/15 ${greenT}`, gray = `bg-gray-500/15 ${grayT}`
  const M: Record<string, { label: string; cls: string; text: string }> = {
    open:                  { label: 'New',               cls: amber, text: amberT },
    info_requested:        { label: 'Info requested',    cls: blue,  text: blueT },
    assigned:              { label: 'Quote requested',   cls: blue,  text: blueT },
    quote_requested:       { label: 'Quote requested',   cls: blue,  text: blueT },
    assessment:            { label: 'Assessment',        cls: blue,  text: blueT },
    quoted:                { label: 'Quoted',            cls: amber, text: amberT },
    quote_revision:        { label: 'Quoted',            cls: amber, text: amberT },
    accepted:              { label: 'Approved',          cls: blue,  text: blueT },
    scheduled:             { label: 'Job scheduled',     cls: blue,  text: blueT },
    in_progress:           { label: 'In progress',       cls: blue,  text: blueT },
    variation_review:      { label: 'Quoted VO',         cls: amber, text: amberT },
    vo_declined:           { label: 'VO declined',       cls: blue,  text: blueT },
    submitted_for_signoff: { label: 'Awaiting sign-off', cls: amber, text: amberT },
    evidence_requested:    { label: 'Sign-off info',     cls: blue,  text: blueT },
    snag:                  { label: 'Snag',              cls: blue,  text: blueT },
    snag_assigned:         { label: 'Snag scheduled',    cls: blue,  text: blueT },
    snag_in_progress:      { label: 'Snag in progress',  cls: blue,  text: blueT },
    snag_resolved:         { label: 'Awaiting sign-off', cls: amber, text: amberT },
    approved_closeout:     { label: 'Close-out',         cls: amber, text: amberT },
    suppliers_declined:    { label: 'Declined (Supplier)', cls: amber, text: amberT },
    completed:             { label: 'Completed',         cls: green, text: greenT },
    cancelled:             { label: 'Cancelled',         cls: gray,  text: grayT },
    declined:              { label: 'Declined',          cls: gray,  text: grayT },
    // legacy
    pending_sign_off:      { label: 'Awaiting sign-off', cls: amber, text: amberT },
    variation_accepted:    { label: 'In progress',       cls: blue,  text: blueT },
  }
  return M[status] ?? { label: status, cls: gray, text: grayT }
}

/**
 * Supplier-flavoured status badge. Action-ownership is the MIRROR of the RM's for
 * the quoting phase: a "Quote requested" job is something the SUPPLIER must act on
 * (submit a quote) → amber, whereas a "Quoted" job is now waiting on the RM's
 * decision → blue. Everything else delegates to rmStatusMeta (labels are shared).
 */
export function supplierStatusMeta(status: string): { label: string; cls: string; text: string } {
  const amberT = 'text-amber-700 dark:text-amber-400', blueT = 'text-blue-700 dark:text-blue-400'
  const amber = `bg-amber-500/15 ${amberT}`, blue = `bg-blue-500/15 ${blueT}`
  if (status === 'quote_requested' || status === 'assigned') return { label: 'Quote requested', cls: amber, text: amberT }
  if (status === 'quoted' || status === 'quote_revision') return { label: 'Quoted', cls: blue, text: blueT }
  // A scheduled job is the SUPPLIER's next move (arrive + mark in progress) → amber,
  // and while the work is IN PROGRESS the ball is still theirs → amber too.
  if (status === 'scheduled' || status === 'in_progress') return { label: rmStatusMeta(status).label, cls: amber, text: amberT }
  // Action-aware from the SUPPLIER's side (mirror of the RM's): amber = the supplier
  // owes the next action, blue = it's done and waiting on the manager.
  if (status === 'submitted_for_signoff') return { label: 'Awaiting sign-off', cls: blue, text: blueT }        // COC/POC in → waiting on the RM
  if (status === 'evidence_requested') return { label: 'Sign-off info', cls: amber, text: amberT }             // RM asked for more → supplier's action
  if (status === 'snag' || status === 'snag_assigned' || status === 'snag_in_progress') return { ...rmStatusMeta(status), cls: amber, text: amberT }  // supplier fixes the snag
  if (status === 'snag_resolved') return { ...rmStatusMeta(status), cls: blue, text: blueT }                   // re-submitted → waiting on the RM
  return rmStatusMeta(status)
}

/** Human-readable ticket reference, e.g. JOB-00042. */
export function formatJobId(jobNumber: number | null | undefined): string | null {
  if (jobNumber == null) return null
  return `JOB-${String(jobNumber).padStart(5, '0')}`
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(amount)
}

// All dates render in South African time (UTC+2), independent of where the code
// runs (server SSR is UTC; client is the device tz) — so times are consistent.
const SA_TZ = 'Africa/Johannesburg'

export function formatDate(dateString: string | null | undefined) {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: SA_TZ,
  })
}

export function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: SA_TZ,
  })
}

export function formatDateTimeShort(dateString: string) {
  return new Date(dateString).toLocaleString('en-ZA', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: SA_TZ,
  })
}

/** Compact human duration for a positive ms span: "2d 3h" · "5h 20m" · "12m". */
export function humanizeDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
