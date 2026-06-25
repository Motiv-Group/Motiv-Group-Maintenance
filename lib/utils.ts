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
  submitted_for_signoff: 'Pending Sign-off',
  evidence_requested:    'Evidence Requested',
  snag:             'Snag',
  snag_assigned:    'Snag Assigned',
  snag_resolved:    'Snag Resolved',
  approved_closeout:'Approved for Close-Out',
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
  submitted_for_signoff: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
  evidence_requested:    'bg-amber-100  text-amber-700  dark:bg-amber-950   dark:text-amber-400',
  snag:             'bg-red-100    text-red-700    dark:bg-red-950    dark:text-red-400',
  snag_assigned:    'bg-pink-100   text-pink-700   dark:bg-pink-950    dark:text-pink-400',
  snag_resolved:    'bg-teal-100   text-teal-700   dark:bg-teal-950    dark:text-teal-400',
  approved_closeout:'bg-green-100  text-green-700  dark:bg-green-950   dark:text-green-400',
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
  submitted_for_signoff: { active: 'bg-orange-500 text-white border-orange-500', inactive: 'text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-900/40 hover:border-orange-400' },
  evidence_requested: { active: 'bg-amber-500 text-white border-amber-500', inactive: 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/40 hover:border-amber-400' },
  snag:        { active: 'bg-red-500 text-white border-red-500',         inactive: 'text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/40 hover:border-red-400' },
  snag_assigned: { active: 'bg-pink-500 text-white border-pink-500',     inactive: 'text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-900/40 hover:border-pink-400' },
  snag_resolved: { active: 'bg-teal-500 text-white border-teal-500',     inactive: 'text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900/40 hover:border-teal-400' },
  approved_closeout: { active: 'bg-green-600 text-white border-green-600', inactive: 'text-green-600 dark:text-green-400 border-green-200 dark:border-green-900/40 hover:border-green-400' },
  completed:   { active: 'bg-green-600 text-white border-green-600',     inactive: 'text-green-600 dark:text-green-400 border-green-200 dark:border-green-900/40 hover:border-green-400' },
  declined:    { active: 'bg-fuchsia-600 text-white border-fuchsia-600', inactive: 'text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-200 dark:border-fuchsia-900/40 hover:border-fuchsia-400' },
  cancelled:   { active: 'bg-gray-500 text-white border-gray-500',       inactive: 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400' },
  // legacy
  variation_pending: { active: 'bg-purple-500 text-white border-purple-500', inactive: 'text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/40 hover:border-purple-400' },
  variation_accepted: { active: 'bg-indigo-500 text-white border-indigo-500', inactive: 'text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/40 hover:border-indigo-400' },
  pending_sign_off:  { active: 'bg-orange-500 text-white border-orange-500', inactive: 'text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-900/40 hover:border-orange-400' },
  snag_in_progress: { active: 'bg-pink-500 text-white border-pink-500',  inactive: 'text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-900/40 hover:border-pink-400' },
}

export type ClientVisibleStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'

/**
 * Collapse the full ticket lifecycle into what a store manager / client is
 * allowed to see: Open → In Progress → Completed (+ Cancelled). Every
 * supplier/RM-side intermediate state (quoted, accepted, variation_pending,
 * pending_sign_off, snag, snag_in_progress, declined) reads as 'open' so the
 * ticket never disappears from their view. Cancelled is shown explicitly.
 */
const CLIENT_IN_PROGRESS = new Set<TicketStatus>([
  'scheduled', 'in_progress', 'variation_review', 'variation_accepted',
  'submitted_for_signoff', 'evidence_requested', 'snag', 'snag_assigned', 'snag_resolved',
  'approved_closeout', 'pending_sign_off', 'snag_in_progress',
])
export function clientVisibleStatus(status: TicketStatus): ClientVisibleStatus | null {
  if (status === 'cancelled')  return 'cancelled'
  if (status === 'completed')  return 'completed'
  if (CLIENT_IN_PROGRESS.has(status)) return 'in_progress'
  return 'open'
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

export function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatDateTimeShort(dateString: string) {
  return new Date(dateString).toLocaleString('en-ZA', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}
