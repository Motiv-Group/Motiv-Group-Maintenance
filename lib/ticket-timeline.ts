// Build a ticket's audit-trail timeline from its record + related rows, so the
// trail shows the full life (logged → quote → schedule → completion → sign-off)
// plus edits and freeform updates — even when ticket_updates is sparse.

export interface TimelineEvent { at: string; label: string; who?: string | null }

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
  quotes?: { amount?: number | null; status: string; created_at: string; updated_at?: string | null }[]
  signoffs?: { status: string; created_at: string }[]
  updates?: { body: string; author_role: string | null; created_at: string }[]
}

export function buildTicketTimeline(t: TimelineInput): TimelineEvent[] {
  const ev: TimelineEvent[] = []
  const push = (at: string | null | undefined, label: string, who?: string | null) => { if (at) ev.push({ at, label, who: who ?? null }) }

  push(t.createdAt, 'Ticket logged')
  push(t.quoteRequestedAt, 'Quote requested', 'Regional Manager')
  push(t.quoteSubmittedAt, 'Quote submitted', 'Supplier')

  // Quote outcomes from the quote rows (amount + accept/decline time).
  for (const q of t.quotes ?? []) {
    if (q.status === 'accepted') push(q.updated_at ?? q.created_at, 'Quote approved', 'Regional Manager')
    else if (q.status === 'declined') push(q.updated_at ?? q.created_at, 'Quote declined', 'Regional Manager')
  }
  // Fallback if no quote rows were supplied but the ticket records an approval.
  if (!(t.quotes ?? []).some(q => q.status === 'accepted')) push(t.quoteApprovedAt, 'Quote approved', 'Regional Manager')

  push(t.scheduledAt, 'Job scheduled', 'Supplier')

  for (const s of t.signoffs ?? []) {
    if (s.status === 'accepted') push(s.created_at, 'Completion approved', 'Regional Manager')
    else if (s.status === 'rejected') push(s.created_at, 'Completion sent back', 'Regional Manager')
    else push(s.created_at, 'Completion submitted', 'Supplier')
  }

  if (t.status === 'completed') push(t.completedAt ?? t.updatedAt, 'Ticket completed')
  if (t.status === 'cancelled') push(t.updatedAt, `Ticket cancelled${t.cancellationReason ? ` — ${t.cancellationReason}` : ''}`)
  push(t.editedAt, 'Ticket edited', t.editedByName)

  for (const u of t.updates ?? []) push(u.created_at, u.body, ROLE_LABEL[u.author_role ?? ''] ?? (u.author_role ?? 'System'))

  return ev.sort((a, b) => +new Date(a.at) - +new Date(b.at))
}
