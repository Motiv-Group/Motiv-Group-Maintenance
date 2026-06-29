// MOTIV health engine v3 — P1–P4 auto-priority (spec §13) + SLA due derivation
import type { Priority, SlaTargets, HealthTicket, SlaRuleResolver } from './types'

export interface PriorityInput {
  severity?: 'low' | 'medium' | 'high' | 'critical' | null
  operational_impact?: string | null
  safety_risk_flag?: boolean
  trading_impact_flag?: boolean
  customer_visible_flag?: boolean
  staff_impact_flag?: boolean
}

/**
 * Derive ticket priority from impact + severity. Highest qualifying band wins.
 * P1 Critical · P2 High · P3 Medium · P4 Low.
 */
export function computePriority(t: PriorityInput): Priority {
  if (t.safety_risk_flag || t.operational_impact === 'safety_risk' || t.operational_impact === 'cannot_trade' || t.severity === 'critical') {
    return 'P1'
  }
  if (t.trading_impact_flag || t.operational_impact === 'trading_affected' || t.severity === 'high') {
    return 'P2'
  }
  if (t.customer_visible_flag || t.staff_impact_flag || t.operational_impact === 'customer_visible' || t.operational_impact === 'staff_inconvenience' || t.severity === 'medium') {
    return 'P3'
  }
  return 'P4'
}

const MIN = 60_000
function addMins(iso: string, mins: number): string {
  return new Date(new Date(iso).getTime() + mins * MIN).toISOString()
}

// SA has no DST — fixed UTC+2. Night = 19:00–06:00 local.
const SA_OFFSET_MIN = 120
function isNightCreated(iso: string): boolean {
  const h = (new Date(iso).getUTCHours() + 2) % 24
  return h >= 19 || h < 6
}
/** The 06:00 SA after a night timestamp (same morning for 00:00–06:00, next for 19:00–24:00). */
function nextMorningISO(iso: string): string {
  const sa = new Date(new Date(iso).getTime() + SA_OFFSET_MIN * MIN)
  const target = new Date(Date.UTC(sa.getUTCFullYear(), sa.getUTCMonth(), sa.getUTCDate(), 6, 0, 0, 0))
  if (sa.getUTCHours() >= 19) target.setUTCDate(target.getUTCDate() + 1)
  return new Date(target.getTime() - SA_OFFSET_MIN * MIN).toISOString()
}
/**
 * SLA start for the created-based timers. Tickets logged 19:00–06:00 (SA) don't
 * start their clock until 06:00 — so overnight hours aren't counted as a breach —
 * UNLESS a quote has already been approved, after which normal timing resumes.
 */
function slaStart(t: HealthTicket): string {
  const approved = t.quote_decision_status === 'approved'
  return (!approved && isNightCreated(t.created_at)) ? nextMorningISO(t.created_at) : t.created_at
}

/** Effective SLA due timestamps — explicit value if present, else start + rule. */
export function deriveDueDates(t: HealthTicket, s: SlaTargets) {
  const base = slaStart(t)
  return {
    firstResponseDue: t.first_response_due_at ?? addMins(base, s.first_response_mins),
    attendanceDue:    t.attendance_due_at    ?? addMins(base, s.attendance_mins),
    resolutionDue:    t.adjusted_resolution_due_at ?? t.resolution_due_at ?? addMins(base, s.resolution_mins),
    quoteDue:         t.quote_due_at ?? (t.quote_requested_at ? addMins(t.quote_requested_at, s.quote_due_mins) : null),
    internalDecisionDue: t.internal_action_due_at ?? (t.quote_submitted_at ? addMins(t.quote_submitted_at, s.internal_decision_mins) : null),
  }
}

/** Resolve a ticket's SLA targets, defaulting via FALLBACK if the rule is missing. */
export function targetsFor(t: HealthTicket, rules: SlaRuleResolver): SlaTargets {
  return rules(t.priority)
}
