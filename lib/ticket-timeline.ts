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
  // Durable per-edit log (ticket_edits) → one event per edit. Overrides the
  // single-slot editedAt/editNote above when non-empty (those remain the fallback
  // for tickets predating the log). note 'added extra work' gets its own wording.
  edits?: { at: string; note?: string | null; byName?: string | null; byRole?: string | null }[]
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
// Call sites now pass descriptive labels ("Job photo 2", "the invoice", "the
// declined quote", "Variation order attachment 1"), so this only backs old rows.
const VIEW_LABEL: Record<string, string> = { quote: 'the quote', photos: 'the photos', photo: 'a job photo', coc: 'the COC & POC', invoice: 'the invoice', attachment: 'an attachment', document: 'a document' }

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
    const what = d.origin === 'snag' ? 'snag' : d.origin === 'variation' ? 'variation order' : d.origin === 'quote_declined' ? 'quote decline' : 'evidence request'
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
    if (/proposed to /.test(b)) push(m.created_at, /proposed to resolve/.test(b) ? 'Proposed to resolve the dispute — drop the request' : 'Proposed to keep the request — it stands', 'info_requested', who)
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
  // Every edit from the durable log; the single-slot columns only when no log rows
  // exist (older tickets). "added extra work" reads as its own event kind.
  const editRows = t.edits ?? []
  if (editRows.length) {
    for (const e of editRows) {
      const isExtraWork = (e.note ?? '').toLowerCase() === 'added extra work'
      // Actor is the editor's ROLE, never their name — person names never appear on
      // any timeline (the friendly-voice narrators bake in the role instead).
      const who = e.byRole ? (ROLE_LABEL[e.byRole] ?? e.byRole) : null
      push(e.at, isExtraWork ? 'Extra work added to the ticket' : `Ticket edited${e.note ? ` — ${e.note}` : ''}`, 'edited', who)
    }
  } else {
    push(t.editedAt, `Ticket edited${t.editNote ? ` — ${t.editNote}` : ''}`, 'edited', null)
  }

  for (const u of t.updates ?? []) push(u.created_at, u.body, 'update', ROLE_LABEL[u.author_role ?? ''] ?? (u.author_role ?? 'System'))
  for (const v of t.views ?? []) push(v.first_viewed_at, `Viewed ${v.item_label || VIEW_LABEL[v.item_type] || 'an attachment'}`, 'viewed', ROLE_LABEL[v.viewer_role ?? ''] ?? (v.viewer_role ?? 'System'))

  // Order by time, then by insertion order so same-minute events keep their logical
  // sequence (a quote's submission always precedes its approval/decline).
  const sorted = ev.sort((a, b) => (+new Date(a.at) - +new Date(b.at)) || (a.seq - b.seq))
  return t.startAt ? sorted.filter(e => +new Date(e.at) >= +new Date(t.startAt!)) : sorted
}

// ── Friendly, per-perspective narration ──────────────────────────────────────
// Restate each audit event as a plain sentence with the actor baked in (so the
// separate "who" line drops away). ONE narrator serves every role via a
// `perspective`, so the wording stays consistent across the RM / store-manager /
// individual / supplier timelines. The rules:
//   · Suppliers are ALWAYS named on the client-side views (RM / SM / individual) —
//     "ABC Plumbing scheduled a visit", never a bare "the supplier". The awarded
//     supplier's company name comes in via ctx.supplierName.
//   · The supplier's OWN timeline is client-voiced: the whole client side (RM + SM)
//     reads "the client"; the supplier's own actions read "you" / "your".
//   · On the store-manager view the regional manager reads "the regional manager".
//   · Person names never appear — only roles / company names.
export type TimelinePerspective = 'rm' | 'sm' | 'individual' | 'supplier'
export interface NarrateCtx {
  /** The awarded supplier's trade-company name — names the supplier on the client-
   *  side (RM / SM / individual) timelines instead of a generic "the supplier". */
  supplierName?: string | null
}

/** The " — reason/note" tail of an audit label, kept verbatim on the friendly one. */
function tailOf(label: string): string { const i = label.indexOf(' — '); return i >= 0 ? label.slice(i) : '' }
/** The word after `key` in an audit label ("Quote requested from X" → X), sans any reason tail. */
function nameAfter(label: string, key: string): string | null {
  const m = label.match(new RegExp(`${key} (.+)$`)); return m ? m[1].replace(/ — .*$/, '') : null
}

export function narrate(e: TimelineEvent, perspective: TimelinePerspective = 'rm', ctx?: NarrateCtx): string {
  const P = perspective
  const name = ctx?.supplierName?.trim() || null
  const L = e.label
  const tail = tailOf(L)

  // The supplier as the subject of a sentence ("<X> scheduled a visit"). On the
  // supplier's own timeline that's "You"; elsewhere it's the company name.
  const supSubj = P === 'supplier' ? 'You' : (name || 'The supplier')

  // The client / manager side as a subject, for a given acting role. `role` says
  // which manager acted so the store-manager view can distinguish RM vs SM.
  const mgr = (role: 'rm' | 'sm' | 'exec'): string => {
    if (P === 'supplier') return 'The client'
    if (P === 'individual') return 'You' // the owner performs every manager-side action
    if (P === 'rm') return role === 'sm' ? 'The store manager' : role === 'exec' ? 'An executive' : 'You'
    // store-manager view
    return role === 'rm' ? 'The regional manager' : role === 'exec' ? 'An executive' : 'You'
  }

  // Actor for free-form events (updates / edits / views) keyed by ROLE_LABEL string.
  const actorForRole = (who: string | null | undefined): string => {
    if (who === 'Supplier') return supSubj
    if (who === 'Regional Manager') return mgr('rm')
    if (who === 'Store Manager') return mgr('sm')
    if (who === 'Executive') return mgr('exec')
    if (who === 'System') return 'The system'
    return who || 'Someone'
  }

  switch (e.tone) {
    case 'logged':
      return P === 'individual' ? 'You logged the job' : `${mgr('sm')} logged the ticket`
    case 'info_added':
      return `${mgr('sm')} added the requested information`
    case 'info_requested':
      if (/on COC & POC/.test(L)) return `${mgr('rm')} requested more evidence on the completion${tail}`
      if (/stands/.test(L)) return `${supSubj} withdrew the dispute — the request stands`
      if (/Proposed to resolve/.test(L)) return `${actorForRole(e.who)} proposed to drop the request`
      if (/Proposed to keep/.test(L)) return `${actorForRole(e.who)} proposed that the request stands`
      return `${mgr('rm')} requested more information${tail}`
    case 'quote_requested': {
      if (/Revised/.test(L)) return P === 'supplier' ? 'The client asked you for a revised quote' : `${mgr('rm')} asked for a revised quote`
      if (P === 'supplier') return 'The client requested a quote'
      const n = nameAfter(L, 'from')
      return n ? `${mgr('rm')} requested a quote from ${n}` : `${mgr('rm')} requested quotes from suppliers`
    }
    case 'quote_submitted': {
      if (P === 'supplier') return 'You submitted a quote'
      const n = nameAfter(L, 'by')
      return `${n || 'The supplier'} submitted a quote`
    }
    case 'quote_approved': {
      if (/retracted/i.test(L)) return `${mgr('rm')} reopened the variation order for review`
      if (P === 'supplier') return 'The client approved your quote'
      const m = L.match(/— (.+)$/)
      return m ? `${mgr('rm')} approved ${m[1]}'s quote` : `${mgr('rm')} approved the quote`
    }
    case 'quote_declined': {
      if (/request declined by/.test(L)) {
        if (P === 'supplier') return 'You declined the quote request'
        const n = nameAfter(L, 'by'); return `${n || 'A supplier'} declined the quote request`
      }
      if (/Dispute raised/.test(L)) return `${supSubj} raised a dispute${tail}`
      if (/Snag schedule declined/.test(L)) return `${mgr('rm')} declined the snag-fix date${tail}`
      if (P === 'supplier') return 'The client declined your quote'
      const m = L.match(/— (.+)$/)
      return m ? `${mgr('rm')} declined ${m[1]}'s quote` : `${mgr('rm')} declined the quote`
    }
    case 'scheduled':
      if (/Snag accepted/.test(L)) return `${supSubj} accepted the snag`
      if (/Snag fix proposed/.test(L)) return `${supSubj} proposed a snag-fix date`
      if (/Snag schedule approved/.test(L)) return `${mgr('rm')} approved the snag-fix date`
      if (/Marked job in progress/.test(L)) return `${supSubj} started the job`
      return `${supSubj} scheduled a visit`
    case 'variation': return `${supSubj} raised a variation order`
    case 'variation_approved':
      return P === 'supplier' ? 'The client approved your variation order' : `${mgr('rm')} approved the variation order`
    case 'variation_declined':
      return P === 'supplier' ? `The client declined your variation order${tail}` : `${mgr('rm')} declined the variation order${tail}`
    case 'completion_submitted': return `${supSubj} submitted the completion`
    case 'completion_approved':
      if (/retracted/i.test(L)) return P === 'supplier' ? `The client reopened it for review${tail}` : `${mgr('rm')} retracted the request — reopened for review${tail}`
      return P === 'supplier' ? 'The client approved the completion' : `${mgr('rm')} approved the completion`
    case 'completion_rejected':
      return P === 'supplier' ? 'The client snagged the completion' : `${mgr('rm')} snagged the completion`
    case 'completed': return 'The job was completed'
    case 'cancelled': return /Declined/.test(L) ? 'Declined — no further updates on this ticket' : `The ticket was cancelled${tail}`
    case 'edited':
      if (/proposal cancelled/.test(L)) return `${actorForRole(e.who)} cancelled their dispute proposal`
      if (/Extra work added/.test(L)) return `${actorForRole(e.who)} added extra work to the ticket`
      return e.who ? `${actorForRole(e.who)} edited the ticket${tail}` : `The ticket was edited${tail}`
    case 'update': return `${actorForRole(e.who)}: ${L}`
    case 'viewed': return `${actorForRole(e.who)} viewed ${L.replace(/^Viewed /, '')}`
    default: return L
  }
}

/** RM-view narration (2nd person for the RM; suppliers named). */
export const rmFriendlyLabel = (e: TimelineEvent, ctx?: NarrateCtx): string => narrate(e, 'rm', ctx)
/** Store-manager-view narration (RM = "the regional manager"; awarded supplier named). */
export const smFriendlyLabel = (e: TimelineEvent, ctx?: NarrateCtx): string => narrate(e, 'sm', ctx)
/** Individual-owner narration (owner = "you"; awarded supplier named). */
export const individualFriendlyLabel = (e: TimelineEvent, ctx?: NarrateCtx): string => narrate(e, 'individual', ctx)
/** Supplier-view narration (client-voiced: client side = "the client"; own actions = "you"). */
export const supplierFriendlyLabel = (e: TimelineEvent, ctx?: NarrateCtx): string => narrate(e, 'supplier', ctx)

// ── Store-Manager view filter ────────────────────────────────────────────────
// The SM sees the ticket's OPERATIONAL story, not the commercial internals:
// edits + extra work, the quote APPROVAL (never submissions/declines/amounts —
// supplier competition is RM-side), scheduling, snags, variation orders,
// completion, cancellation and the info exchange. Everything quote-competitive,
// dispute-related and view-tracking is dropped ('quote_declined' is also the
// dispute tone, so excluding it removes both).
const SM_TONES: ReadonlySet<TimelineTone> = new Set<TimelineTone>([
  'logged', 'info_requested', 'info_added', 'edited',
  'quote_approved', 'scheduled',
  'variation', 'variation_approved', 'variation_declined',
  'completion_submitted', 'completion_approved', 'completion_rejected',
  'completed', 'cancelled',
  'update',   // supplier progress notes (operational — the Activity tab folded into the timeline)
])

/** The Store-Manager (and owner-adjacent) subset of a ticket's timeline. */
export function filterTimelineForSm(events: TimelineEvent[]): TimelineEvent[] {
  return events.filter(e => {
    if (!SM_TONES.has(e.tone)) return false
    // The variation-retraction event rides 'completion_approved' via the dispute
    // flow — dispute mechanics stay off the SM view.
    if (/retracted/i.test(e.label)) return false
    return true
  })
}
