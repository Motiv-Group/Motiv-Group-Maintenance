// ============================================================
// MOTIV ticket workflow — single source of truth for the lifecycle.
// Mirrors docs/Workflow flowchart. Statuses, transitions, and the role
// allowed to perform each action all live here so the API routes + UI stay
// consistent. Pure (no DB / React imports).
// ============================================================

import type { SlaTargets } from './health/types'

export type WorkflowRole = 'store_manager' | 'supplier' | 'regional_manager' | 'executive' | 'system_admin' | 'individual'

export type TicketStatus =
  | 'open'                  // Work Request Created · Review & Validate
  | 'info_requested'        // Request More Information
  | 'assigned'              // Assign Owner / Supplier / Internal Team
  | 'assessment'            // Assessment / Site Inspection
  | 'quote_requested'       // Quote Requested
  | 'quoted'                // Quote Submitted (under review)
  | 'quote_revision'        // Request Quote Revision
  | 'accepted'              // Instruction to Proceed (approved, or quote not required)
  | 'scheduled'             // Job Scheduled
  | 'in_progress'           // Work In Progress
  | 'variation_review'      // Variation Submitted / Review
  | 'vo_declined'           // Variation Order declined — supplier to re-submit / message RM
  | 'submitted_for_signoff' // Completion Submitted · Review & Sign-off
  | 'evidence_requested'    // Request More Evidence
  | 'snag'                  // Snag Created
  | 'snag_assigned'         // Snag Accepted by supplier
  | 'snag_in_progress'      // Snag being fixed
  | 'snag_resolved'         // Snag Resolved
  | 'approved_closeout'     // Approved for Close-Out
  | 'suppliers_declined'    // Every invited supplier declined — RM to re-assign
  | 'completed'             // Final Close-Out (terminal)
  | 'cancelled'             // Reject / Cancel (terminal)
  | 'declined'              // Quote rejected (terminal)

export const TERMINAL_STATUSES: TicketStatus[] = ['completed', 'cancelled', 'declined']
export function isTerminalStatus(s: string): boolean { return (TERMINAL_STATUSES as string[]).includes(s) }

// The competitive commercial phase — while suppliers are still being invited /
// quoting, before a quote is approved. The assign / (re)quote routes fan out across
// many ticket_suppliers + quotes rows (not a single state-machine move), so they
// live outside /transition, but they validate their source status against THIS one
// shared list rather than each hard-coding their own.
export const COMMERCIAL_SOURCE_STATUSES: TicketStatus[] = ['open', 'info_requested', 'assigned', 'assessment', 'quote_requested', 'quoted', 'quote_revision', 'suppliers_declined']
export function isCommercialPhase(s: string): boolean { return (COMMERCIAL_SOURCE_STATUSES as string[]).includes(s) }

export type StatusGroup = 'intake' | 'commercial' | 'execution' | 'closeout' | 'closed'
export type StatusTone =
  | 'blue' | 'cyan' | 'teal' | 'amber' | 'purple' | 'indigo' | 'orange' | 'red' | 'pink' | 'green' | 'gray' | 'slate'

export interface StatusMeta { label: string; group: StatusGroup; tone: StatusTone }

export const STATUS_META: Record<TicketStatus, StatusMeta> = {
  open:                  { label: 'New',                   group: 'intake',     tone: 'blue' },
  info_requested:        { label: 'Info Requested',        group: 'intake',     tone: 'slate' },
  assigned:              { label: 'Assigned',              group: 'intake',     tone: 'teal' },
  assessment:            { label: 'Assessment',            group: 'intake',     tone: 'cyan' },
  quote_requested:       { label: 'Quote Requested',       group: 'commercial', tone: 'cyan' },
  quoted:                { label: 'Quote Submitted',       group: 'commercial', tone: 'cyan' },
  quote_revision:        { label: 'Quote Revision',        group: 'commercial', tone: 'amber' },
  accepted:              { label: 'Instruction to Proceed',group: 'commercial', tone: 'teal' },
  scheduled:             { label: 'Scheduled',             group: 'execution',  tone: 'indigo' },
  in_progress:           { label: 'In Progress',           group: 'execution',  tone: 'amber' },
  variation_review:      { label: 'Variation Review',      group: 'execution',  tone: 'purple' },
  vo_declined:           { label: 'VO Declined',           group: 'execution',  tone: 'red' },
  submitted_for_signoff: { label: 'Pending Sign-off',      group: 'closeout',   tone: 'orange' },
  evidence_requested:    { label: 'Evidence Requested',    group: 'closeout',   tone: 'amber' },
  snag:                  { label: 'Snag Raised',           group: 'closeout',   tone: 'red' },
  snag_assigned:         { label: 'Snag Scheduled',        group: 'closeout',   tone: 'indigo' },
  snag_in_progress:      { label: 'Snag In Progress',      group: 'closeout',   tone: 'amber' },
  snag_resolved:         { label: 'Snag Resolved',         group: 'closeout',   tone: 'teal' },
  approved_closeout:     { label: 'Approved for Close-Out',group: 'closeout',   tone: 'green' },
  suppliers_declined:    { label: 'Declined (Supplier)',   group: 'commercial', tone: 'red' },
  completed:             { label: 'Completed',             group: 'closed',     tone: 'green' },
  cancelled:             { label: 'Cancelled',             group: 'closed',     tone: 'gray' },
  declined:              { label: 'Declined',              group: 'closed',     tone: 'slate' },
}

export interface Transition {
  action: string         // verb used by the API routes
  label: string          // button text
  to: TicketStatus
  roles: WorkflowRole[]  // who may perform it
}

// Allowed transitions out of each status. Decision diamonds in the flowchart
// become multiple transitions sharing a `from` status.
export const TRANSITIONS: Record<TicketStatus, Transition[]> = {
  open: [
    { action: 'validate',     label: 'Validate & assign', to: 'assigned',       roles: ['regional_manager'] },
    { action: 'request_info', label: 'Request more info',  to: 'info_requested', roles: ['regional_manager'] },
    { action: 'reject',       label: 'Reject / cancel',    to: 'cancelled',      roles: ['regional_manager', 'individual'] },
  ],
  info_requested: [
    { action: 'resubmit', label: 'Resubmit request', to: 'open',       roles: ['store_manager'] },
    { action: 'reject',   label: 'Cancel',           to: 'cancelled',  roles: ['regional_manager'] },
  ],
  assigned: [
    { action: 'require_assessment', label: 'Send for assessment', to: 'assessment',      roles: ['regional_manager', 'supplier'] },
    { action: 'request_quote',      label: 'Request quote',       to: 'quote_requested', roles: ['regional_manager', 'supplier'] },
    { action: 'proceed_no_quote',   label: 'Proceed (no quote)',  to: 'accepted',        roles: ['regional_manager'] },
    { action: 'reject',             label: 'Cancel',              to: 'cancelled',       roles: ['regional_manager'] },
  ],
  assessment: [
    { action: 'request_quote',    label: 'Request quote',      to: 'quote_requested', roles: ['regional_manager', 'supplier'] },
    { action: 'proceed_no_quote', label: 'Proceed (no quote)', to: 'accepted',        roles: ['regional_manager'] },
  ],
  quote_requested: [
    { action: 'submit_quote', label: 'Submit quote', to: 'quoted', roles: ['supplier'] },
  ],
  quoted: [
    // SEC-018: quote APPROVE / DECLINE go through /api/tickets/[id]/quote-decision
    // ONLY — it awards a single supplier + closes the other invites + sets supplier_id.
    // The old engine actions approve_quote/reject_quote were a divergent second path
    // (marked ALL pending quotes accepted, never set supplier_id, left invites open)
    // and were unreachable from the UI — removed. 'request_revision' (ask for a fresh
    // quote) stays as a plain transition.
    { action: 'request_revision',label: 'Request revision',to: 'quote_revision', roles: ['regional_manager', 'individual'] },
  ],
  quote_revision: [
    { action: 'submit_quote', label: 'Resubmit quote', to: 'quoted', roles: ['supplier'] },
  ],
  accepted: [
    // Straight to work after approval — the supplier marks the job in progress
    // (no separate scheduling step). Variation orders come after sign-off.
    { action: 'start_work', label: 'Mark as In progress', to: 'in_progress', roles: ['supplier'] },
  ],
  scheduled: [
    { action: 'accept_schedule',  label: 'Accept proposed time', to: 'scheduled',   roles: ['regional_manager'] },
    { action: 'start_work',       label: 'Mark as In progress',  to: 'in_progress', roles: ['supplier'] },
  ],
  in_progress: [
    { action: 'submit_completion',  label: 'Submit COC & POC',   to: 'submitted_for_signoff', roles: ['supplier'] },
  ],
  variation_review: [
    // A VO is raised AFTER the COC/POC is approved. Approving it returns to the
    // close-out stage (raise more or the RM closes out); declining → vo_declined.
    { action: 'approve_variation', label: 'Approve variation', to: 'approved_closeout', roles: ['regional_manager', 'individual'] },
    { action: 'reject_variation',  label: 'Reject variation',  to: 'vo_declined',       roles: ['regional_manager', 'individual'] },
  ],
  vo_declined: [
    // Supplier re-submits a revised VO, or the RM finalises the close-out.
    { action: 'submit_variation', label: 'Re-submit Variation', to: 'variation_review', roles: ['supplier'] },
    { action: 'close_out',        label: 'Final close-out',     to: 'completed',        roles: ['regional_manager', 'individual'] },
  ],
  submitted_for_signoff: [
    // Approving the COC/POC no longer completes the ticket — it moves to the
    // close-out stage, where the supplier may raise a variation order before the
    // RM does the final close-out.
    { action: 'approve',          label: 'Approve COC & POC',     to: 'approved_closeout',  roles: ['regional_manager', 'individual'] },
    { action: 'request_evidence', label: 'Request more evidence', to: 'evidence_requested', roles: ['regional_manager', 'individual'] },
    { action: 'raise_snag',       label: 'Raise snag',            to: 'snag',               roles: ['regional_manager', 'individual'] },
  ],
  evidence_requested: [
    { action: 'submit_completion', label: 'Resubmit completion', to: 'submitted_for_signoff', roles: ['supplier'] },
  ],
  snag: [
    { action: 'accept_snag', label: 'Accept snag', to: 'snag_assigned', roles: ['supplier'] },
  ],
  snag_assigned: [
    { action: 'approve_snag',          label: 'Approve snag schedule', to: 'snag_assigned',    roles: ['regional_manager', 'individual'] },
    { action: 'decline_snag_schedule', label: 'Decline snag schedule', to: 'snag',             roles: ['regional_manager', 'individual'] },
    // Supplier may revise the proposed fix date while it's still awaiting the RM's
    // approval (the handler blocks it once the schedule is agreed) — stays snag_assigned.
    { action: 'update_snag_schedule',  label: 'Update snag schedule',  to: 'snag_assigned',    roles: ['supplier'] },
    { action: 'start_snag',            label: 'Snag in progress',      to: 'snag_in_progress', roles: ['supplier'] },
  ],
  snag_in_progress: [
    { action: 'submit_completion', label: 'Upload new COC & POC', to: 'submitted_for_signoff', roles: ['supplier'] },
  ],
  snag_resolved: [
    { action: 'submit_completion', label: 'Back to sign-off', to: 'submitted_for_signoff', roles: ['supplier'] },
  ],
  approved_closeout: [
    // COC/POC approved. The supplier can raise a variation order for extra work;
    // the RM does the final close-out.
    { action: 'submit_variation', label: 'Raise Variation', to: 'variation_review', roles: ['supplier'] },
    { action: 'close_out',        label: 'Final close-out', to: 'completed',        roles: ['regional_manager', 'individual'] },
  ],
  // Every invited supplier declined — the RM re-assigns (via /assign, not a
  // workflow transition) or cancels the ticket.
  suppliers_declined: [
    { action: 'reject', label: 'Cancel', to: 'cancelled', roles: ['regional_manager'] },
  ],
  completed:  [],
  cancelled:  [],
  declined:   [],
}

/** Transitions a given role may perform from a status. */
export function transitionsFor(status: string, role: WorkflowRole): Transition[] {
  const list = TRANSITIONS[status as TicketStatus] ?? []
  return list.filter(t => t.roles.includes(role))
}

/** Validate an action: returns the transition if `role` may do `action` from `status`, else null. */
export function resolveTransition(status: string, action: string, role: WorkflowRole): Transition | null {
  return (TRANSITIONS[status as TicketStatus] ?? []).find(t => t.action === action && t.roles.includes(role)) ?? null
}

export function statusLabel(s: string): string { return STATUS_META[s as TicketStatus]?.label ?? s }

// ============================================================
// Pure lifecycle helpers (B19 step 1) — extracted verbatim from
// app/api/tickets/[id]/transition/route.ts. Pure: no DB imports;
// `now` is injected (same style as lib/health/*).
// ============================================================

// Map a destination status → the explicit blocker/pause columns the health
// engine reads. Mirrors lib/health/sla.ts status buckets. Idempotent: each
// transition (re)sets blocker_started_at = now for the new blocker state.
export function resolveBlockerState(toStatus: string, now: string, sla: SlaTargets): Record<string, unknown> {
  const addMins = (m: number) => new Date(new Date(now).getTime() + m * 60_000).toISOString()
  const supplier = { current_blocker: 'supplier_action', blocker_owner_type: 'supplier', blocker_started_at: now, sla_paused: false, internal_action_due_at: null }
  const internalDecision = { current_blocker: 'quote_approval', blocker_owner_type: 'regional_manager', blocker_started_at: now, sla_paused: true, pause_reason: 'awaiting_decision', pause_started_at: now, internal_action_due_at: addMins(sla.internal_decision_mins) }
  const signoff = { current_blocker: 'completion_signoff', blocker_owner_type: 'regional_manager', blocker_started_at: now, sla_paused: true, pause_reason: 'awaiting_signoff', pause_started_at: now, internal_action_due_at: addMins(sla.internal_decision_mins) }
  const cleared = { current_blocker: null, blocker_owner_type: null, blocker_started_at: null, sla_paused: false, pause_ended_at: now, internal_action_due_at: null }
  switch (toStatus) {
    case 'quoted': case 'variation_review': return internalDecision
    case 'submitted_for_signoff': case 'approved_closeout': return signoff
    case 'completed': case 'cancelled': case 'declined': return cleared
    case 'open': return { current_blocker: null, blocker_owner_type: null, blocker_started_at: null, sla_paused: false, internal_action_due_at: null }
    case 'info_requested': return { current_blocker: null, blocker_owner_type: 'store', sla_paused: false, internal_action_due_at: null }
    default: return supplier
  }
}

// The quote-due deadline stamped when a quote is (re)requested:
// now + the priority's quote_due_mins SLA target.
export function computeQuoteDue(now: string, sla: SlaTargets): string {
  return new Date(new Date(now).getTime() + sla.quote_due_mins * 60_000).toISOString()
}

// Stamp freshness against the acting side (drives the health Data-Quality + stale checks).
export function stampFreshness(role: WorkflowRole, now: string):
  { last_supplier_update_at: string } | { last_store_update_at: string } | { last_internal_update_at: string } {
  return role === 'supplier' ? { last_supplier_update_at: now }
    : role === 'store_manager' ? { last_store_update_at: now }
    : { last_internal_update_at: now }
}
