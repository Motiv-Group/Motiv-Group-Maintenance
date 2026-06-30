// Build a ticket's audit-trail timeline from its record + related rows, so the
// trail shows the full life (logged → quote → schedule → completion → sign-off)
// plus edits and freeform updates — even when ticket_updates is sparse.

// Semantic tone per event → coloured dot in the audit trail. Mirrors the status
// palette used across the app (quote=cyan/violet, approve=emerald, snag/cancel=red…).
export type TimelineTone = 'logged' | 'info_requested' | 'info_added' | 'quote_requested' | 'quote_submitted' | 'quote_approved' | 'quote_declined' | 'scheduled' | 'completion_submitted' | 'completion_approved' | 'completion_rejected' | 'completed' | 'cancelled' | 'edited' | 'update'
export interface TimelineEvent { at: string; label: string; who?: string | null; tone: TimelineTone }

const ROLE_LABEL: Record<string, string> = {
  regional_manager: 'Regional Manager', supplier: 'Supplier', store_manager: 'Store Manager',
  client: 'Store Manager', executive: 'Executive', system: 'System',
}

export interface TimelineInput {
  createdAt: string
  status?: string | null
  quoteRequestedAt?: string | null
  quoteSubmittedAt?: string | null
  quoteApprovedAt?: string | null
  scheduledAt?: string | null
  completedAt?: string | null
  editedAt?: string | null
  editedByName?: string | null
  cancellationReason?: string | null
  updatedAt?: string | null
  // RM↔Store-Manager "more information" exchange (only passed on the RM view).
  infoRequestedAt?: string | null
  infoAddedAt?: string | null
  infoRequestReason?: string | null
  // When this supplier was declined off the ticket — the trail stops here for them
  // (only passed on the supplier view when they're out of the job).
  supplierDeclinedAt?: string | null
  // The supplier's proposed snag-fix date (distinct from the original job schedule).
  snagScheduledAt?: string | null
  quotes?: { amount?: number | null; status: string; created_at: string; updated_at?: string | null }[]
  signoffs?: { status: string; created_at: string }[]
  updates?: { body: string; author_role: string | null; created_at: string }[]
}

export function buildTicketTimeline(t: TimelineInput): TimelineEvent[] {
  const ev: TimelineEvent[] = []
  const push = (at: string | null | undefined, label: string, tone: TimelineTone, who?: string | null) => { if (at) ev.push({ at, label, tone, who: who ?? null }) }

  push(t.createdAt, 'Ticket logged', 'logged')
  // The "more info" loop — RM asked, store manager answered (RM audit trail only).
  push(t.infoRequestedAt, `More information requested${t.infoRequestReason ? ` — ${t.infoRequestReason}` : ''}`, 'info_requested', 'Regional Manager')
  push(t.infoAddedAt, 'Information added', 'info_added', 'Store Manager')
  push(t.quoteRequestedAt, 'Quote requested', 'quote_requested', 'Regional Manager')
  push(t.quoteSubmittedAt, 'Quote submitted', 'quote_submitted', 'Supplier')

  // Quote outcomes from the quote rows (amount + accept/decline time).
  for (const q of t.quotes ?? []) {
    if (q.status === 'accepted') push(q.updated_at ?? q.created_at, 'Quote approved', 'quote_approved', 'Regional Manager')
    else if (q.status === 'declined') push(q.updated_at ?? q.created_at, 'Quote declined', 'quote_declined', 'Regional Manager')
  }
  // Fallback if no quote rows were supplied but the ticket records an approval.
  if (!(t.quotes ?? []).some(q => q.status === 'accepted')) push(t.quoteApprovedAt, 'Quote approved', 'quote_approved', 'Regional Manager')

  push(t.scheduledAt, 'Job scheduled', 'scheduled', 'Supplier')
  push(t.snagScheduledAt, 'Snag job scheduled', 'scheduled', 'Supplier')

  for (const s of t.signoffs ?? []) {
    if (s.status === 'accepted') push(s.created_at, 'Completion approved', 'completion_approved', 'Regional Manager')
    else if (s.status === 'rejected') push(s.created_at, 'Snagged', 'completion_rejected', 'Regional Manager')
    else push(s.created_at, 'Completion submitted', 'completion_submitted', 'Supplier')
  }

  if (t.status === 'completed') push(t.completedAt ?? t.updatedAt, 'Ticket completed', 'completed')
  if (t.status === 'cancelled') push(t.updatedAt, `Ticket cancelled${t.cancellationReason ? ` — ${t.cancellationReason}` : ''}`, 'cancelled')
  push(t.supplierDeclinedAt, 'Declined — no further updates on this ticket', 'cancelled')
  push(t.editedAt, 'Ticket edited', 'edited', t.editedByName)

  for (const u of t.updates ?? []) push(u.created_at, u.body, 'update', ROLE_LABEL[u.author_role ?? ''] ?? (u.author_role ?? 'System'))

  return ev.sort((a, b) => +new Date(a.at) - +new Date(b.at))
}
