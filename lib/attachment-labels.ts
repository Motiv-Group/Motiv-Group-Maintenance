// Canonical, specific labels for every ticket attachment / photo — ONE source of
// truth so the audit "Viewed …" rows and the on-screen links always read the same
// and always carry the context that makes them unambiguous: which supplier, which
// quote reference, which completion round / variation order. This is what keeps the
// timeline from showing vague labels like "quote photo 1" or a bare "COC".
//
// Every helper takes an optional supplier name (the trade company the item belongs
// to). When present it prefixes as "<Supplier> — <thing>"; when absent it degrades
// to the plain thing (e.g. on the supplier's own page where the owner is implicit,
// or on tickets with no supplier yet).

/** "<Supplier> — <rest>" when a supplier name is known, else just "<rest>". */
function withSupplier(name: string | null | undefined, rest: string): string {
  const n = (name ?? '').trim()
  return n ? `${n} — ${rest}` : rest
}

/** " (Submission #N)" round suffix, or "" when the round isn't known. */
function round(submissionNo?: number | null): string {
  return submissionNo ? ` (Submission #${submissionNo})` : ''
}

/** A supplier's quote: "<Supplier> — Quote Q-1042" (ref) or "<Supplier> — Quote". */
export function quoteLabel(supplierName?: string | null, quoteRef?: string | null): string {
  const ref = (quoteRef ?? '').trim()
  return withSupplier(supplierName, ref ? `Quote ${ref}` : 'Quote')
}

/** Certificate of completion: "<Supplier> — Certificate of completion (Submission #2)". */
export function cocLabel(supplierName?: string | null, submissionNo?: number | null): string {
  return withSupplier(supplierName, `Certificate of completion${round(submissionNo)}`)
}

/** Invoice: "<Supplier> — Invoice (Submission #2)". */
export function invoiceLabel(supplierName?: string | null, submissionNo?: number | null): string {
  return withSupplier(supplierName, `Invoice${round(submissionNo)}`)
}

/** Before/after proof-of-completion photo: "<Supplier> — Before photo 1 (Submission #2)". */
export function completionPhotoLabel(
  kind: 'before' | 'after',
  index: number,
  supplierName?: string | null,
  submissionNo?: number | null,
): string {
  const word = kind === 'before' ? 'Before' : 'After'
  return withSupplier(supplierName, `${word} photo ${index}${round(submissionNo)}`)
}

/** Supplier progress photo: "<Supplier> — Progress photo 1". */
export function progressPhotoLabel(index: number, supplierName?: string | null): string {
  return withSupplier(supplierName, `Progress photo ${index}`)
}

/** Variation-order attachment: "<Supplier> — Variation order #1, attachment 1"
 *  (VO number omitted when there's only one / it isn't known). */
export function variationAttachmentLabel(
  index: number,
  supplierName?: string | null,
  voNo?: number | null,
): string {
  const body = voNo ? `Variation order #${voNo}, attachment ${index}` : `Variation order attachment ${index}`
  return withSupplier(supplierName, body)
}

/** Dispute evidence attachment: "<Supplier> — Dispute evidence 1". */
export function disputeEvidenceLabel(index: number, supplierName?: string | null): string {
  return withSupplier(supplierName, `Dispute evidence ${index}`)
}

/** A photo the store manager attached when logging the ticket: "Ticket photo 1". */
export function ticketPhotoLabel(index: number): string {
  return `Ticket photo ${index}`
}

/** A document attached to the ticket (logged / added-info / extra-work): "Ticket document 1". */
export function ticketDocLabel(index: number): string {
  return `Ticket document ${index}`
}
