export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type TicketStatus =
  // canonical lifecycle (see lib/workflow.ts)
  | 'open' | 'info_requested' | 'assigned' | 'assessment'
  | 'quote_requested' | 'quoted' | 'quote_revision' | 'accepted'
  | 'scheduled' | 'in_progress' | 'variation_review' | 'vo_declined'
  | 'submitted_for_signoff' | 'evidence_requested'
  | 'snag' | 'snag_assigned' | 'snag_resolved'
  | 'approved_closeout' | 'suppliers_declined' | 'completed' | 'cancelled' | 'declined'
  // legacy v2 values still referenced by some UI
  | 'pending_sign_off' | 'snag_in_progress' | 'variation_pending' | 'variation_accepted'
export type QuoteStatus = 'pending' | 'accepted' | 'declined'
export type QuoteType = 'quote' | 'variation'
export type UserRole = 'client' | 'store_manager' | 'regional_manager' | 'supplier' | 'executive'

/** Four-band health classification used for stores, regions and the estate. */
export type RagStatus = 'green' | 'amber' | 'red' | 'critical'

/** Who currently owns the next action on a blocked ticket. */
export type BlockerOwnerType = 'supplier' | 'regional_manager' | 'finance' | 'store' | 'executive'

export interface Profile {
  id: string
  role: UserRole
  full_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  company_name: string | null
  sub_store: string | null
  regional_manager_id: string | null
  region_id: string | null
  branch_code: string | null
  capex_budget: number | null
  closed_at: string | null
  closure_reason: string | null
  created_at: string
}

export interface Ticket {
  id: string
  job_number?: number | null   // legacy global sequence (JOB-00042)
  store_job_number?: number | null
  store_job_year?: number | null
  job_ref?: string | null      // per-store reference, e.g. WBP-2026-0007
  branch_code?: string | null
  client_id: string            // the store profile (store_id)
  region_id?: string | null
  supplier_id?: string | null  // sub-supplier (trade directory) assigned
  assigned_user_id?: string | null
  title: string
  description: string
  priority: Priority
  status: TicketStatus
  photo_urls: string[]
  created_at: string
  updated_at: string

  // Classification & impact
  category?: string | null
  subcategory?: string | null
  asset_id?: string | null
  severity?: Severity | null
  operational_impact?: string | null
  safety_risk_flag?: boolean
  trading_impact_flag?: boolean
  customer_visible_flag?: boolean
  staff_impact_flag?: boolean
  closed_at?: string | null

  // Supplier SLA timestamps
  first_response_due_at?: string | null
  first_response_at?: string | null
  attendance_due_at?: string | null
  attended_at?: string | null

  // Quote lifecycle
  quote_required?: boolean
  quote_requested_at?: string | null
  quote_due_at?: string | null
  quote_submitted_at?: string | null
  quote_value?: number | null
  quote_approval_required?: boolean
  quote_approval_status?: 'pending' | 'approved' | 'rejected' | null
  quote_approved_at?: string | null
  quote_rejected_at?: string | null

  // Resolution
  resolution_due_at?: string | null
  adjusted_resolution_due_at?: string | null
  completed_at?: string | null

  // Dual SLA cache
  supplier_sla_status?: string | null
  internal_sla_status?: string | null
  sla_paused?: boolean
  pause_reason?: string | null
  pause_started_at?: string | null
  pause_ended_at?: string | null
  total_paused_minutes?: number

  // Blocker
  current_blocker?: string | null
  blocker_owner_type?: BlockerOwnerType | null
  blocker_owner_id?: string | null
  blocker_started_at?: string | null
  internal_action_due_at?: string | null
  delay_owner?: 'supplier' | 'internal' | 'store' | 'none' | null

  // Repeat defects
  repeat_defect_flag?: boolean
  repeat_defect_group_id?: string | null

  // Evidence
  evidence_required?: boolean
  before_photo_uploaded?: boolean
  after_photo_uploaded?: boolean
  completion_certificate_uploaded?: boolean
  invoice_uploaded?: boolean

  // Store confirmation
  store_confirmation_required?: boolean
  store_confirmed_at?: string | null

  // Freshness
  last_supplier_update_at?: string | null
  last_internal_update_at?: string | null
  last_store_update_at?: string | null

  // Cached health
  ticket_health_score?: number | null
  ticket_health_status?: string | null

  profiles?: Profile
  quotes?: Quote[]
}

export interface Region {
  id: string
  name: string
  code: string | null
  regional_manager_id: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface SlaRule {
  id: string
  region_id: string | null
  priority: Priority
  first_response_mins: number
  attendance_mins: number
  resolution_mins: number
  quote_review_mins: number
  quote_approval_mins: number
  instruction_mins: number
  store_access_mins: number
  escalation_response_mins: number
  completion_confirm_mins: number
}

export interface RepeatDefectGroup {
  id: string
  store_id: string | null
  region_id: string | null
  category: string | null
  supplier_id: string | null
  occurrence_count: number
  window_days: number
  first_seen_at: string | null
  last_seen_at: string | null
  root_cause: string | null
  suggested_action: string | null
  status: 'open' | 'monitoring' | 'resolved'
}

export interface Approval {
  id: string
  ticket_id: string | null
  quote_id: string | null
  approval_type: 'quote' | 'variation' | 'completion' | 'funding'
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
  requested_from: string | null
  decided_by: string | null
  decided_at: string | null
  due_at: string | null
  amount: number | null
  reason: string | null
}

export interface Quote {
  id: string
  ticket_id: string
  admin_id: string
  type: QuoteType
  amount: number
  amount_incl_vat: number | null
  description: string
  valid_until: string | null
  file_url: string | null
  status: QuoteStatus
  decline_reason?: string | null
  created_at: string
  tickets?: Ticket
  profiles?: Profile
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  link: string | null
  read: boolean
  created_at: string
}

export interface Supplier {
  id: string
  company_name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  trade: string | null
  qualified: boolean
  qualification_number: string | null
  qualification_expiry: string | null
  vat_number: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export function isStoreManager(role: UserRole | string | null) {
  return role === 'store_manager' || role === 'client'
}

export function isExecutive(role: UserRole | string | null) {
  return role === 'executive'
}

export interface Completion {
  id: string
  ticket_id: string
  admin_id: string
  coc_url: string | null
  poc_urls: string[]
  status: 'pending' | 'approved' | 'rejected'
  reject_reason: string | null
  notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  tickets?: Ticket
  profiles?: Profile
}
