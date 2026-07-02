// Build a ticket's audit-trail timeline from its record + related rows, so the
// trail shows the full life (logged → quote → schedule → completion → sign-off)
// plus edits and freeform updates — even when ticket_updates is sparse.

// Semantic tone per event → coloured dot in the audit trail. Mirrors the status
// palette used across the app (quote=cyan/violet, approve=emerald, snag/cancel=red…).
export type TimelineTone = 'logged' | 'info_requested' | 'info_added' | 'quote_requested' | 'quote_submitted' | 'quote_approved' | 'quote_declined' | 'scheduled' | 'completion_submitted' | 'completion_approved' | 'completion_rejected' | 'completed' | 'cancelled' | 'edited' | 'update' | 'viewed' | 'variation' | 'variation_approved' | 'variation_declined'
export interface TimelineEvent { at: string; label: string; who?: string | null; tone: TimelineTone }

const ROLE_LABEL: Record<string, string> = {
  regional_manager: 'Regional Manager', supplier: 'Supplier', store_manager: 'Store Manager',
  client: 'Store Manager', executive: 'Executive', system: 'System',
}

export interface TimelineInput {
  createdAt: string
  status?: string | null
  quoteRequestedAt?: string | null
  // Every quote-request round (RM assign / re-assign / re-quote) → one "Quote
  // requested" event each. Overrides quoteRequestedAt when non-empty.
  quoteRequests?: (string | null)[]
  quoteSubmittedAt?: string | null
  quoteApprovedAt?: string | null
  scheduledAt?: string | null
  completedAt?: string | null
  editedAt?: string | null
  editedByName?: string | null
  // Optional note on the edit (e.g. "added extra work") → "Ticket edited — <note>".
  editNote?: string | null
  cancellationReason?: string | null
  updatedAt?: string | null
  // RM↔Store-Manager "more information" exchange (only passed on the RM view).
  infoRequestedAt?: string | null
  infoAddedAt?: string | null
  infoRequestReason?: string | null
  // When this supplier was declined off the ticket — the trail stops here for them
  // (only passed on the supplier view when they're out of the job).
  supplierDeclinedAt?: string | null
  // Hide everything before this instant — the supplier's trail starts at the quote
  // request (they weren't involved while the ticket was being logged / triaged).
  startAt?: string | null
  // The supplier's proposed snag-fix date (distinct from the original job schedule).
  snagScheduledAt?: string | null
  // When the RM asked this supplier to submit a revised quote (re-quote) → its own
  // "Revised quote requested" event, distinct from the decline that preceded it.
  requoteRequestedAt?: string | null
  // Every supplier's decline (name + when) — shown on the RM trail once ALL declined.
  supplierDeclines?: { name: string; at: string }[]
  // When the supplier marked the job in progress (moved past the VO stage).
  workStartedAt?: string | null
  quotes?: { amount?: number | null; status: string; created_at: string; updated_at?: string | null; supplierName?: string | null }[]
  // Variation orders raised on the ticket → raised / approved / declined events.
  variations?: { status: string; created_at: string; reviewed_at?: string | null; reject_reason?: string | null }[]
  signoffs?: { status: string; created_at: string; reviewed_at?: string | null; reject_reason?: string | null }[]
  updates?: { body: string; author_role: string | null; created_at: string }[]
  // Who first opened which specific item on the ticket (audit-trail view tracking).
  views?: { viewer_role: string | null; item_type: string; item_label?: string | null; first_viewed_at: string }[]
}

// Fallback wording when a view has no specific label (older, section-level rows).
const VIEW_LABEL: Record<string, string> = { quote: 'the quote', photos: 'the photos', photo: 'a photo', coc: 'the COC & POC', invoice: 'the invoice' }

export function buildTicketTimeline(t: TimelineInput): TimelineEvent[] {
  const ev: TimelineEvent[] = []
  const push = (at: string | null | undefined, label: string, tone: TimelineTone, who?: string | null) => { if (at) ev.push({ at, label, tone, who: who ?? null }) }

  push(t.createdAt, 'Ticket logged', 'logged')
  // The "more info" loop — RM asked, store manager answered (RM audit trail only).
  push(t.infoRequestedAt, `More information requested${t.infoRequestReason ? ` — ${t.infoRequestReason}` : ''}`, 'info_requested', 'Regional Manager')
  push(t.infoAddedAt, 'Information added', 'info_added', 'Store Manager')
  // A "Quote requested" event per request round (each RM assign / re-assign /
  // re-quote). Falls back to the single timestamp on trails without the log.
  const requestTimes = (t.quoteRequests ?? []).filter(Boolean) as string[]
  for (const at of new Set(requestTimes.length ? requestTimes : (t.quoteRequestedAt ? [t.quoteRequestedAt] : [])))
    push(at, 'Quote requested', 'quote_requested', 'Regional Manager')

  // Quote events from the quote rows. When the supplier's name is known
  // (competitive quoting) each is named, so the RM trail reads exactly which
  // supplier submitted / was approved / was declined.
  let namedSubmission = false
  for (const q of t.quotes ?? []) {
    const who = q.supplierName ? ` — ${q.supplierName}` : ''
    if (q.supplierName) { push(q.created_at, `Quote submitted — ${q.supplierName}`, 'quote_submitted', 'Supplier'); namedSubmission = true }
    if (q.status === 'accepted') push(q.updated_at ?? q.created_at, `Quote approved${who}`, 'quote_approved', 'Regional Manager')
    else if (q.status === 'declined') push(q.updated_at ?? q.created_at, `Quote declined${who}`, 'quote_declined', 'Regional Manager')
  }
  // No per-supplier names on the rows (supplier's own trail) → one generic event.
  if (!namedSubmission) push(t.quoteSubmittedAt, 'Quote submitted', 'quote_submitted', 'Supplier')
  // Fallback if no quote rows were supplied but the ticket records an approval.
  if (!(t.quotes ?? []).some(q => q.status === 'accepted')) push(t.quoteApprovedAt, 'Quote approved', 'quote_approved', 'Regional Manager')

  push(t.requoteRequestedAt, 'Revised quote requested', 'quote_requested', 'Regional Manager')
  for (const d of t.supplierDeclines ?? []) push(d.at, `Quote request declined by ${d.name}`, 'quote_declined', 'Supplier')
  push(t.scheduledAt, 'Job scheduled', 'scheduled', 'Supplier')
  push(t.snagScheduledAt, 'Snag job scheduled', 'scheduled', 'Supplier')

  // Variation-order lifecycle: raised by the supplier, then the RM's decision.
  for (const v of t.variations ?? []) {
    push(v.created_at, 'Variation order raised', 'variation', 'Supplier')
    if (v.status === 'approved') push(v.reviewed_at ?? v.created_at, 'Variation order approved', 'variation_approved', 'Regional Manager')
    else if (v.status === 'rejected') push(v.reviewed_at ?? v.created_at, `Variation order declined${v.reject_reason ? ` — ${v.reject_reason}` : ''}`, 'variation_declined', 'Regional Manager')
  }
  // The supplier marked the job in progress (after clearing the VO stage).
  push(t.workStartedAt, 'Marked job in progress', 'scheduled', 'Supplier')

  // Each signoff row is one COC/POC submission: log the submission, then its
  // outcome (approved / snagged / sent back for more evidence) at review time.
  for (const s of t.signoffs ?? []) {
    push(s.created_at, 'Completion submitted', 'completion_submitted', 'Supplier')
    if (s.status === 'accepted') push(s.reviewed_at ?? s.created_at, 'Completion approved', 'completion_approved', 'Regional Manager')
    else if (s.status === 'rejected') push(s.reviewed_at ?? s.created_at, 'Snagged', 'completion_rejected', 'Regional Manager')
    else if (s.status === 'evidence_requested') push(s.reviewed_at ?? s.created_at, `More information requested on COC & POC${s.reject_reason ? ` — ${s.reject_reason}` : ''}`, 'info_requested', 'Regional Manager')
  }

  if (t.status === 'completed') push(t.completedAt ?? t.updatedAt, 'Ticket completed', 'completed')
  if (t.status === 'cancelled') push(t.updatedAt, `Ticket cancelled${t.cancellationReason ? ` — ${t.cancellationReason}` : ''}`, 'cancelled')
  push(t.supplierDeclinedAt, 'Declined — no further updates on this ticket', 'cancelled')
  push(t.editedAt, `Ticket edited${t.editNote ? ` — ${t.editNote}` : ''}`, 'edited', t.editedByName)

  for (const u of t.updates ?? []) push(u.created_at, u.body, 'update', ROLE_LABEL[u.author_role ?? ''] ?? (u.author_role ?? 'System'))
  for (const v of t.views ?? []) push(v.first_viewed_at, `Viewed ${v.item_label || VIEW_LABEL[v.item_type] || 'an attachment'}`, 'viewed', ROLE_LABEL[v.viewer_role ?? ''] ?? (v.viewer_role ?? 'System'))

  const sorted = ev.sort((a, b) => +new Date(a.at) - +new Date(b.at))
  return t.startAt ? sorted.filter(e => +new Date(e.at) >= +new Date(t.startAt!)) : sorted
}
