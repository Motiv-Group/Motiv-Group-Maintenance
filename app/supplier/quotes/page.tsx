export const dynamic = 'force-dynamic'

import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { SupplierQuotesTable, type SupplierQuoteItem, type QuoteKind } from '@/components/supplier/SupplierQuotesTable'

// Submitted quotes whose ticket is past the quoting/decision phase belong in Sign-off /
// archive, not here — EXCEPT declined ones, which the supplier should still see.
const HIDE_FROM_QUOTES = new Set(['submitted_for_signoff', 'approved_closeout', 'evidence_requested', 'snag', 'snag_assigned', 'snag_in_progress', 'snag_resolved', 'pending_sign_off', 'completed'])
// Ticket statuses where this supplier still owes a quote.
const AWAITING_QUOTE = new Set(['assigned', 'assessment', 'quote_requested', 'quote_revision'])

const kindOf = (s: string): QuoteKind => s === 'accepted' ? 'accepted' : s === 'declined' ? 'declined' : s === 'revision_requested' ? 'requested' : 'pending'
const declinedLabelOf = (by: string | null) => by === 'supplier' ? 'Declined (you)' : by === 'regional_manager' ? 'Declined (Client)' : 'Declined'

export default async function SupplierQuotesPage() {
  const { companyId, supplierIds } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)
  const declinedByByTicket = new Map(d.tickets.map(t => [t.id, t.declinedBy]))
  const quotedTicketIds = new Set(d.quotes.map(q => q.ticketId))

  // Submitted quotes — declined always show; others hide once past the decision phase.
  const submitted: SupplierQuoteItem[] = d.quotes
    .filter(q => q.status === 'declined' || !HIDE_FROM_QUOTES.has(q.ticketStatus))
    .map(q => {
      const kind = kindOf(q.status)
      return {
        key: `q-${q.id}`, ticketId: q.ticketId, storeName: q.storeName, jobRef: q.jobRef, category: q.category, priority: String(q.priority ?? ''), description: q.description,
        kind, at: q.createdAt, proposedVisit: q.proposedScheduleAt, validUntil: q.validUntil, amount: q.amount, amountInclVat: q.amountInclVat,
        declinedLabel: kind === 'declined' ? declinedLabelOf(declinedByByTicket.get(q.ticketId) ?? null) : null,
      }
    })

  // Tickets where the RM requested a quote but this supplier hasn't submitted yet.
  const requested: SupplierQuoteItem[] = d.tickets
    .filter(t => !t.declinedForMe && AWAITING_QUOTE.has(t.status) && !quotedTicketIds.has(t.id))
    .map(t => ({ key: `r-${t.id}`, ticketId: t.id, storeName: t.storeName, jobRef: t.jobRef, category: t.category, priority: String(t.priority ?? ''), description: t.description, kind: 'requested' as const, at: t.quoteRequestedAt ?? t.createdAt, proposedVisit: null, validUntil: null, amount: null, amountInclVat: null }))

  // Tickets the supplier declined before quoting (no quote row).
  const declinedReq: SupplierQuoteItem[] = d.tickets
    .filter(t => t.declinedForMe && !quotedTicketIds.has(t.id))
    .map(t => ({ key: `d-${t.id}`, ticketId: t.id, storeName: t.storeName, jobRef: t.jobRef, category: t.category, priority: String(t.priority ?? ''), description: t.description, kind: 'declined' as const, at: t.declinedAt ?? t.quoteRequestedAt ?? t.createdAt, proposedVisit: null, validUntil: null, amount: null, amountInclVat: null, declinedLabel: declinedLabelOf(t.declinedBy) }))

  const items = [...requested, ...submitted, ...declinedReq]
  return <SupplierQuotesTable items={items} />
}
