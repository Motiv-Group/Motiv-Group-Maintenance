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
  // Each quote-request round → one "Quote requested" event, named with the supplier
  // when known ("Quote requested from X"). Overrides quoteRequestedAt when non-empty.
  quoteRequests?: { at: string | null; supplierName?: string | null }[]
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
  // Snag-fix schedule lifecycle → its own audit events. Proposed by the supplier,
  // then the RM approves or declines (declines carry the reason).
  snagProposedAt?: string | null
  snagApprovedAt?: string | null
  snagDeclinedAt?: string | null
  snagDeclineReason?: string | null
  // Durable per-round snag-fix schedule log → one event per proposal / approval /
  // decline, so the trail keeps EVERY round. Overrides the single fields above when
  // present (they remain the fallback for tickets predating the log).
  snagScheduleEvents?: { kind: string; scheduled_for?: string | null; reason?: string | null; created_at: string }[]
  // When the supplier accepted the snag (took on the corrective work).
  snagAcceptedAt?: string | null
  // Snag / evidence disputes → "Dispute raised" + "Dispute resolved (outcome)" events.
  disputes?: { origin: string; status: string; outcome?: string | null; created_at: string; resolved_at?: string | null; reason?: string | null }[]
  // Dispute thread messages — the propose / cancel negotiation steps are surfaced as
  // their own audit events (the resolution is already logged from the dispute row).
  disputeMessages?: { author_role: string | null; body: string | null; created_at: string }[]
  // When the RM asked this supplier to submit a revised quote (re-quote) → its own
  // "Revised quote requested" event, distinct from the decline that preceded it.
  requoteRequestedAt?: string | null
  // Every re-quote round (durable) → one "Revised quote requested" event each.
  // Overrides requoteRequestedAt when non-empty.
  requoteRequests?: (string | null)[]
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
  const ev: (TimelineEvent & { seq: number })[] = []
  let seq = 0
  const push = (at: string | null | undefined, label: string, tone: TimelineTone, who?: string | null) => { if (at) ev.push({ at, label, tone, who: who ?? null, seq: seq++ }) }

  push(t.createdAt, 'Ticket logged', 'logged')
  // The "more info" loop — RM asked, store manager answered (RM audit trail only).
  push(t.infoRequestedAt, `More information requested${t.infoRequestReason ? ` — ${t.infoRequestReason}` : ''}`, 'info_requested', 'Regional Manager')
  push(t.infoAddedAt, 'Information added', 'info_added', 'Store Manager')
  // A "Quote requested" event per request round (each RM assign / re-assign /
  // re-quote), named with the supplier when known ("Quote requested from X").
  // Falls back to the single timestamp on trails without the durable log.
  const requestRounds = (t.quoteRequests ?? []).filter(r => r && r.at)
  const requestList = requestRounds.length ? requestRounds : (t.quoteRequestedAt ? [{ at: t.quoteRequestedAt }] : [])
  const seenRequest = new Set<string>()
  for (const r of requestList) {
    const key = `${r.at}|${r.supplierName ?? ''}`
    if (seenRequest.has(key)) continue
    seenRequest.add(key)
    push(r.at, `Quote requested${r.supplierName ? ` from ${r.supplierName}` : ''}`, 'quote_requested', 'Regional Manager')
  }

  // Quote events from the quote rows. Each submission is logged BEFORE its outcome
  // so the trail always reads submitted → approved/declined, never the reverse when
  // the two share a minute. Named on the RM trail (supplierName present); the
  // supplier's own trail shows a plain "Quote submitted".
  for (const q of t.quotes ?? []) {
    const who = q.supplierName ? ` — ${q.supplierName}` : ''
    push(q.created_at, `Quote submitted${q.supplierName ? ` by ${q.supplierName}` : ''}`, 'quote_submitted', 'Supplier')
    if (q.status === 'accepted') push(q.updated_at ?? q.created_at, `Quote approved${who}`, 'quote_approved', 'Regional Manager')
    else if (q.status === 'declined') push(q.updated_at ?? q.created_at, `Quote declined${who}`, 'quote_declined', 'Regional Manager')
  }
  // Fallback only when there were no quote rows at all (submission, then approval).
  if (!(t.quotes ?? []).length) push(t.quoteSubmittedAt, 'Quote submitted', 'quote_submitted', 'Supplier')
  if (!(t.quotes ?? []).some(q => q.status === 'accepted')) push(t.quoteApprovedAt, 'Quote approved', 'quote_approved', 'Regional Manager')

  // A "Revised quote requested" event per re-quote round (durable), else the single
  // fallback timestamp.
  const requoteTimes = (t.requoteRequests ?? []).filter(Boolean) as string[]
  for (const at of new Set(requoteTimes.length ? requoteTimes : (t.requoteRequestedAt ? [t.requoteRequestedAt] : [])))
    push(at, 'Revised quote requested', 'quote_requested', 'Regional Manager')
  for (const d of t.supplierDeclines ?? []) push(d.at, `Quote request declined by ${d.name}`, 'quote_declined', 'Supplier')
  push(t.scheduledAt, 'Job scheduled', 'scheduled', 'Supplier')
  // Snag lifecycle: the supplier accepts the snag, then proposes a fix date → RM
  // approves / declines. The durable log keeps every round; without it, fall back to
  // the single latest-round fields.
  push(t.snagAcceptedAt, 'Snag accepted', 'scheduled', 'Supplier')
  const snagEvents = t.snagScheduleEvents ?? []
  if (snagEvents.length) {
    for (const e of snagEvents) {
      if (e.kind === 'proposed') push(e.created_at, 'Snag fix proposed', 'scheduled', 'Supplier')
      else if (e.kind === 'approved') push(e.created_at, 'Snag schedule approved', 'scheduled', 'Regional Manager')
      else if (e.kind === 'declined') push(e.created_at, `Snag schedule declined${e.reason ? ` — ${e.reason}` : ''}`, 'quote_declined', 'Regional Manager')
    }
  } else {
    push(t.snagProposedAt ?? t.snagScheduledAt, 'Snag fix proposed', 'scheduled', 'Supplier')
    push(t.snagApprovedAt, 'Snag schedule approved', 'scheduled', 'Regional Manager')
    push(t.snagDeclinedAt, `Snag schedule declined${t.snagDeclineReason ? ` — ${t.snagDeclineReason}` : ''}`, 'quote_declined', 'Regional Manager')
  }

  // Variation-order lifecycle: raised by the supplier, then the RM's decision.
  for (const v of t.variations ?? []) {
    push(v.created_at, 'Variation order raised', 'variation', 'Supplier')
    if (v.status === 'approved') push(v.reviewed_at ?? v.created_at, 'Variation order approved', 'variation_approved', 'Regional Manager')
    else if (v.status === 'rejected') push(v.reviewed_at ?? v.created_at, `Variation order declined${v.reject_reason ? ` — ${v.reject_reason}` : ''}`, 'variation_declined', 'Regional Manager')
  }
  // The supplier marked the job in progress (after clearing the VO stage).
  push(t.workStartedAt, 'Marked job in progress', 'scheduled', 'Supplier')

  // Dispute lifecycle: the supplier raises it (snag / evidence request), the RM
  // resolves it as upheld (requirement stands) or withdrawn (dropped).
  for (const d of t.disputes ?? []) {
    const what = d.origin === 'snag' ? 'snag' : d.origin === 'variation' ? 'variation order' : 'evidence request'
    push(d.created_at, `Dispute raised — ${what}`, 'quote_declined', 'Supplier')
    if (d.status === 'resolved') {
      const reason = d.reason ? ` — ${d.reason}` : ''
      const Cap = `${what[0].toUpperCase()}${what.slice(1)}`
      // 'withdrawn' = the RM's request was dropped/retracted; 'upheld' = the supplier
      // withdrew their dispute so the request stands.
      if (d.outcome === 'withdrawn') push(d.resolved_at ?? d.created_at, d.origin === 'variation' ? `Variation-order decline retracted — reopened for review${reason}` : `${Cap} retracted by the manager${reason}`, 'completion_approved', 'Regional Manager')
      else push(d.resolved_at ?? d.created_at, `Dispute withdrawn — ${what} stands${reason}`, 'info_requested', 'Supplier')
    }
  }
  // Negotiation steps (propose / cancel) from the dispute thread's system messages —
  // the resolution itself is already logged above from the dispute row.
  for (const m of t.disputeMessages ?? []) {
    const b = m.body ?? ''
    const who = ROLE_LABEL[m.author_role ?? ''] ?? (m.author_role ?? 'System')
    if (/proposed to /.test(b)) push(m.created_at, /proposed to resolve/.test(b) ? 'Proposed to resolve the dispute — drop the request' : 'Proposed to uphold the request — it stands', 'info_requested', who)
    else if (/cancelled their proposal/.test(b)) push(m.created_at, 'Dispute proposal cancelled', 'edited', who)
  }

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

  // Order by time, then by insertion order so same-minute events keep their logical
  // sequence (a quote's submission always precedes its approval/decline).
  const sorted = ev.sort((a, b) => (+new Date(a.at) - +new Date(b.at)) || (a.seq - b.seq))
  return t.startAt ? sorted.filter(e => +new Date(e.at) >= +new Date(t.startAt!)) : sorted
}

// Restate one audit event as a friendly, store-manager-style sentence for the RM
// Timeline tab — the actor is baked into the sentence (so the "who" line drops
// away) while every detail (supplier names, reasons) is kept. `buildTicketTimeline`
// stays the audit voice for the supplier trail; only the RM view is re-narrated.
function actorOf(who?: string | null): string | null {
  if (!who) return null
  if (who === 'Regional Manager') return 'You'
  if (who === 'Store Manager') return 'The store manager'
  if (who === 'Supplier') return 'The supplier'
  if (who === 'Executive') return 'An executive'
  if (who === 'System') return 'The system'
  return who // a person's name (e.g. on an edit)
}
/** The " — reason/note" tail of an audit label, kept verbatim on the friendly one. */
function tailOf(label: string): string { const i = label.indexOf(' — '); return i >= 0 ? label.slice(i) : '' }
/** The word after `key` in an audit label ("Quote requested from X" → X), sans any reason tail. */
function nameAfter(label: string, key: string): string | null {
  const m = label.match(new RegExp(`${key} (.+)$`)); return m ? m[1].replace(/ — .*$/, '') : null
}

export function rmFriendlyLabel(e: TimelineEvent): string {
  const A = actorOf(e.who)
  const L = e.label
  const tail = tailOf(L)
  switch (e.tone) {
    case 'logged': return 'The store manager logged the ticket'
    case 'info_added': return 'The store manager added the requested information'
    case 'info_requested':
      if (/on COC & POC/.test(L)) return `You requested more evidence on the completion${tail}`
      if (/stands/.test(L)) return 'The supplier withdrew the dispute — the request stands'
      if (/Proposed to resolve/.test(L)) return `${A ?? 'Someone'} proposed to drop the request`
      if (/Proposed to uphold/.test(L)) return `${A ?? 'Someone'} proposed that the request stands`
      return `You requested more information${tail}`
    case 'quote_requested': {
      if (/Revised/.test(L)) return 'You asked for a revised quote'
      const n = nameAfter(L, 'from'); return n ? `You requested a quote from ${n}` : 'You requested quotes from suppliers'
    }
    case 'quote_submitted': { const n = nameAfter(L, 'by'); return n ? `${n} submitted a quote` : 'The supplier submitted a quote' }
    case 'quote_approved': {
      if (/retracted/i.test(L)) return 'You reopened the variation order for review'
      const m = L.match(/— (.+)$/); return m ? `You approved ${m[1]}'s quote` : 'You approved the quote'
    }
    case 'quote_declined': {
      if (/request declined by/.test(L)) { const n = nameAfter(L, 'by'); return `${n ?? 'A supplier'} declined the quote request` }
      if (/Dispute raised/.test(L)) return `The supplier raised a dispute${tail}`
      if (/Snag schedule declined/.test(L)) return `You declined the snag-fix date${tail}`
      const m = L.match(/— (.+)$/); return m ? `You declined ${m[1]}'s quote` : 'You declined the quote'
    }
    case 'scheduled':
      if (/Snag accepted/.test(L)) return 'The supplier accepted the snag'
      if (/Snag fix proposed/.test(L)) return 'The supplier proposed a snag-fix date'
      if (/Snag schedule approved/.test(L)) return 'You approved the snag-fix date'
      if (/Marked job in progress/.test(L)) return 'The supplier started work'
      return 'The supplier scheduled a visit'
    case 'variation': return 'The supplier raised a variation order'
    case 'variation_approved': return 'You approved the variation order'
    case 'variation_declined': return `You declined the variation order${tail}`
    case 'completion_submitted': return 'The supplier submitted the completion'
    case 'completion_approved': return /retracted/i.test(L) ? `You retracted the request — reopened for review${tail}` : 'You approved the completion'
    case 'completion_rejected': return 'You snagged the completion'
    case 'completed': return 'The job was completed'
    case 'cancelled': return /Declined/.test(L) ? 'Declined — no further updates on this ticket' : `The ticket was cancelled${tail}`
    case 'edited':
      if (/proposal cancelled/.test(L)) return `${A ?? 'Someone'} cancelled their dispute proposal`
      return A ? `${A} edited the ticket${tail}` : `The ticket was edited${tail}`
    case 'update': return A ? `${A}: ${L}` : L
    case 'viewed': return `${A ?? 'Someone'} viewed ${L.replace(/^Viewed /, '')}`
    default: return L
  }
}
