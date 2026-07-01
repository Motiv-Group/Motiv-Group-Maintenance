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

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open:        'Open Tickets',
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
  snag_assigned:    'Snag Assigned',
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
export const STATUS_COLORS: Record<TicketStatus, string> = {
  open:        'bg-blue-100    text-blue-700    dark:bg-blue-950    dark:text-blue-400',
  info_requested:   'bg-slate-100  text-slate-700  dark:bg-slate-900   dark:text-slate-300',
  assigned:         'bg-teal-100   text-teal-700   dark:bg-teal-950    dark:text-teal-400',
  assessment:       'bg-cyan-100   text-cyan-700   dark:bg-cyan-950    dark:text-cyan-400',
  quote_requested:  'bg-cyan-100   text-cyan-700   dark:bg-cyan-950    dark:text-cyan-400',
  quoted:      'bg-cyan-100    text-cyan-700    dark:bg-cyan-950    dark:text-cyan-400',
  quote_revision:   'bg-amber-100  text-amber-700  dark:bg-amber-950   dark:text-amber-400',
  accepted:    'bg-teal-100    text-teal-700    dark:bg-teal-950    dark:text-teal-400',
  scheduled:        'bg-indigo-100 text-indigo-700 dark:bg-indigo-950  dark:text-indigo-400',
  in_progress: 'bg-amber-100   text-amber-700   dark:bg-amber-950   dark:text-amber-400',
  variation_review: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
  vo_declined:      'bg-red-100    text-red-700    dark:bg-red-950    dark:text-red-400',
  submitted_for_signoff: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
  evidence_requested:    'bg-amber-100  text-amber-700  dark:bg-amber-950   dark:text-amber-400',
  snag:             'bg-red-100    text-red-700    dark:bg-red-950    dark:text-red-400',
  snag_assigned:    'bg-pink-100   text-pink-700   dark:bg-pink-950    dark:text-pink-400',
  snag_resolved:    'bg-teal-100   text-teal-700   dark:bg-teal-950    dark:text-teal-400',
  approved_closeout:'bg-green-100  text-green-700  dark:bg-green-950   dark:text-green-400',
  suppliers_declined: 'bg-red-100   text-red-700    dark:bg-red-950    dark:text-red-400',
  completed:   'bg-green-100   text-green-700   dark:bg-green-950   dark:text-green-400',
  declined:    'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-400',
  cancelled:   'bg-gray-100    text-gray-600    dark:bg-gray-800    dark:text-gray-400',
  // legacy
  variation_pending: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
  variation_accepted: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400',
  pending_sign_off:  'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
  snag_in_progress: 'bg-pink-100   text-pink-700   dark:bg-pink-950   dark:text-pink-400',
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
 * Condensed-but-accurate ticket status for RM views (recent card, tickets tab,
 * ticket page). Unlike clientVisibleStatus (3-state, for the SM), this reflects
 * the commercial/execution phase so the overview updates as the ticket moves.
 */
export function rmStatusMeta(status: string): { label: string; cls: string; text: string } {
  const cyanT = 'text-cyan-700 dark:text-cyan-400', violetT = 'text-violet-700 dark:text-violet-400'
  const goldT = 'text-amber-700 dark:text-[#C6A35D]', orangeT = 'text-orange-700 dark:text-orange-400'
  const blueT = 'text-blue-700 dark:text-blue-400', tealT = 'text-teal-700 dark:text-teal-400'
  const redT = 'text-red-700 dark:text-red-400', greenT = 'text-emerald-700 dark:text-emerald-400', grayT = 'text-gray-600 dark:text-gray-400'
  const indigoT = 'text-indigo-700 dark:text-indigo-400', purpleT = 'text-purple-700 dark:text-purple-400'
  const cyan = `bg-cyan-500/15 ${cyanT}`, violet = `bg-violet-500/15 ${violetT}`, gold = `bg-[#C6A35D]/15 ${goldT}`, orange = `bg-orange-500/15 ${orangeT}`, indigo = `bg-indigo-500/15 ${indigoT}`, purple = `bg-purple-500/15 ${purpleT}`
  const M: Record<string, { label: string; cls: string; text: string }> = {
    open:                  { label: 'Open',              cls: `bg-blue-500/15 ${blueT}`, text: blueT },
    info_requested:        { label: 'Info requested',    cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', text: 'text-amber-700 dark:text-amber-400' },
    assigned:              { label: 'Quote requested',   cls: cyan, text: cyanT },
    quote_requested:       { label: 'Quote requested',   cls: cyan, text: cyanT },
    assessment:            { label: 'Assessment',        cls: cyan, text: cyanT },
    quoted:                { label: 'Quoted',            cls: violet, text: violetT },
    quote_revision:        { label: 'Quoted',            cls: violet, text: violetT },
    accepted:              { label: 'Approved',          cls: `bg-teal-500/15 ${tealT}`, text: tealT },
    scheduled:             { label: 'Job scheduled',     cls: indigo, text: indigoT },
    in_progress:           { label: 'In progress',       cls: gold, text: goldT },
    variation_review:      { label: 'Quoted VO',         cls: purple, text: purpleT },
    vo_declined:           { label: 'VO declined',       cls: `bg-red-500/15 ${redT}`, text: redT },
    submitted_for_signoff: { label: 'Awaiting sign-off', cls: orange, text: orangeT },
    evidence_requested:    { label: 'Sign-off info',     cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', text: 'text-amber-700 dark:text-amber-400' },
    snag:                  { label: 'Snag',              cls: `bg-red-500/15 ${redT}`, text: redT },
    snag_assigned:         { label: 'Snag',              cls: `bg-red-500/15 ${redT}`, text: redT },
    snag_resolved:         { label: 'Awaiting sign-off', cls: orange, text: orangeT },
    approved_closeout:     { label: 'Awaiting sign-off', cls: orange, text: orangeT },
    suppliers_declined:    { label: 'Declined (Supplier)', cls: `bg-red-500/15 ${redT}`, text: redT },
    completed:             { label: 'Completed',         cls: `bg-emerald-500/15 ${greenT}`, text: greenT },
    cancelled:             { label: 'Cancelled',         cls: `bg-gray-500/15 ${grayT}`, text: grayT },
    declined:              { label: 'Declined',          cls: `bg-gray-500/15 ${grayT}`, text: grayT },
    // legacy
    pending_sign_off:      { label: 'Awaiting sign-off', cls: orange, text: orangeT },
    snag_in_progress:      { label: 'Snag',              cls: `bg-red-500/15 ${redT}`, text: redT },
    variation_accepted:    { label: 'In progress',       cls: gold, text: goldT },
  }
  return M[status] ?? { label: status, cls: `bg-gray-500/15 ${grayT}`, text: grayT }
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

export function formatDate(dateString: string) {
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
