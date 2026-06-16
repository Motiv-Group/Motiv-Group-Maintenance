// ============================================================
// MOTIV health engine v3 — domain types (decoupled from DB rows)
// Pure: every function takes `now` for testability. No DB imports here.
// ============================================================

export type Priority = 'P1' | 'P2' | 'P3' | 'P4'
export type Severity = 'low' | 'medium' | 'high' | 'critical'

export type OperationalImpact =
  | 'none' | 'cosmetic' | 'customer_visible' | 'staff_inconvenience'
  | 'trading_affected' | 'safety_risk' | 'cannot_trade'

/** Health bands (spec §8). */
export type HealthStatus = 'controlled' | 'attention' | 'at_risk' | 'critical'

export type BlockerOwnerType = 'supplier' | 'regional_manager' | 'finance' | 'store' | 'executive' | 'system_admin'

const TERMINAL = new Set(['completed', 'cancelled', 'declined'])
export function isActive(status: string): boolean { return !TERMINAL.has(status) }

/** Minimal ticket shape the engine needs (subset of the v3 tickets row). */
export interface HealthTicket {
  id: string
  store_id: string
  region_id?: string | null
  supplier_id?: string | null
  title?: string | null
  category?: string | null
  priority: Priority
  severity?: Severity | null
  operational_impact?: OperationalImpact | null
  safety_risk_flag?: boolean
  trading_impact_flag?: boolean
  customer_visible_flag?: boolean
  staff_impact_flag?: boolean
  status: string
  created_at: string
  completed_at?: string | null
  // supplier SLA
  first_response_due_at?: string | null
  first_response_at?: string | null
  attendance_due_at?: string | null
  attended_at?: string | null
  resolution_due_at?: string | null
  adjusted_resolution_due_at?: string | null
  // quote / commercial
  quote_required?: boolean
  quote_requested_at?: string | null
  quote_due_at?: string | null
  quote_submitted_at?: string | null
  quote_value?: number | null
  quote_decision_required?: boolean
  quote_decision_status?: 'pending' | 'approved' | 'rejected' | null
  internal_action_due_at?: string | null
  // blocker
  sla_paused?: boolean
  current_blocker?: string | null
  blocker_owner_type?: BlockerOwnerType | null
  blocker_started_at?: string | null
  // evidence
  evidence_required?: boolean
  before_photo_uploaded?: boolean
  after_photo_uploaded?: boolean
  completion_certificate_uploaded?: boolean
  invoice_uploaded?: boolean
  // signoff / store confirm
  submitted_for_signoff_at?: string | null
  signoff_status?: string | null
  store_confirmation_required?: boolean
  store_confirmed_at?: string | null
  // freshness
  last_supplier_update_at?: string | null
  last_internal_update_at?: string | null
  last_store_update_at?: string | null
  updated_at: string
  // repeat
  repeat_defect_flag?: boolean
}

/** Per-priority SLA targets (minutes), from sla_rules. */
export interface SlaTargets {
  priority: Priority
  first_response_mins: number
  attendance_mins: number
  quote_due_mins: number
  resolution_mins: number
  internal_decision_mins: number
}

export type SlaRuleResolver = (priority: Priority) => SlaTargets
