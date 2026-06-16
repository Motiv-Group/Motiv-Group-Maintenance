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

/** Effective SLA due timestamps — explicit value if present, else created_at + rule. */
export function deriveDueDates(t: HealthTicket, s: SlaTargets) {
  return {
    firstResponseDue: t.first_response_due_at ?? addMins(t.created_at, s.first_response_mins),
    attendanceDue:    t.attendance_due_at    ?? addMins(t.created_at, s.attendance_mins),
    resolutionDue:    t.adjusted_resolution_due_at ?? t.resolution_due_at ?? addMins(t.created_at, s.resolution_mins),
    quoteDue:         t.quote_due_at ?? (t.quote_requested_at ? addMins(t.quote_requested_at, s.quote_due_mins) : null),
    internalDecisionDue: t.internal_action_due_at ?? (t.quote_submitted_at ? addMins(t.quote_submitted_at, s.internal_decision_mins) : null),
  }
}

/** Resolve a ticket's SLA targets, defaulting via FALLBACK if the rule is missing. */
export function targetsFor(t: HealthTicket, rules: SlaRuleResolver): SlaTargets {
  return rules(t.priority)
}
