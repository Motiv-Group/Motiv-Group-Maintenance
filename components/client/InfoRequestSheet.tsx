'use client'

// Store-manager "info requested" REVIEW sheet — shown BEFORE the Add-Info form.
// Same shared ticket-sheet layout as the RM "Ticket & quotes" / supplier
// "Ticket" pop-ups: heading + close, job ref + badges + bold title, an amber
// callout with what the manager asked for, the ticket information rows and the
// job photos, then a blue "Add requested info" button (bottom-right) that swaps
// to the EXISTING AddInfoModal form (the call site owns that modal).
import { MessageSquarePlus, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { PhotoThumbs } from '@/components/ui/PhotoThumbs'
import { SheetHeader, SheetSection, InfoRows, SheetFooter } from '@/components/workflow/TicketInfoSheet'
import { priorityBadgeClass, priorityLabel, clientStatusBadgeClass, clientStatusLabel } from '@/components/client/ticketBadges'
import { formatDateTime, OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'
import type { StoreManagerTicket } from '@/lib/health/data'

export function InfoRequestSheet({ ticketId, jobRef, title, priority, storeName, category, operationalImpact, createdAt, dueAt, description, requestReason, photoUrls, onClose, onAddInfo }: {
  ticketId: string
  jobRef: string | null
  title: string
  priority: string
  storeName?: string | null
  category: string | null
  operationalImpact: string | null
  createdAt?: string
  dueAt?: string | null
  description: string | null
  requestReason: string | null
  photoUrls: string[] // signed DISPLAY urls — never written back (the form keeps the raw paths)
  onClose: () => void
  onAddInfo: () => void // open the existing AddInfoModal (the sheet closes itself)
}) {
  // Badge helpers only read priority/status/infoAdded — same minimal-cast
  // pattern the ticket detail page uses for its badgeTicket.
  const badgeTicket = { priority, status: 'info_requested', infoAdded: false } as unknown as StoreManagerTicket
  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      {close => (
        <div className="space-y-4">
          {/* Sheet heading + close (the shared Modal has no title bar of its own). */}
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-[var(--text)]">Ticket</h2>
            <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--hover)]"><X size={18} /></button>
          </div>

          <SheetHeader jobRef={jobRef} title={title}
            badges={<>
              <span className={`inline-flex justify-center rounded-md px-2 py-1 text-[10px] font-bold ${priorityBadgeClass(badgeTicket)}`}>{priorityLabel(badgeTicket)}</span>
              <span className={`inline-flex justify-center rounded-md px-2 py-1 text-[10px] font-bold ${clientStatusBadgeClass(badgeTicket)}`}>{clientStatusLabel(badgeTicket)}</span>
            </>} />

          {requestReason && (
            <div className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm text-[var(--text)] ring-1 ring-amber-500/20">
              <span className="font-semibold text-amber-700 dark:text-amber-400">Requested information:</span> {requestReason}
            </div>
          )}

          <SheetSection label="Ticket information">
            <InfoRows rows={[
              { label: 'Store', value: storeName ?? null },
              { label: 'Category', value: category },
              { label: 'Operational impact', value: operationalImpact ? (OPERATIONAL_IMPACT_LABELS[operationalImpact] ?? operationalImpact) : null },
              { label: 'Logged', value: createdAt ? formatDateTime(createdAt) : null },
              { label: 'Due', value: dueAt ? formatDateTime(dueAt) : null },
              { label: 'Description', value: description ? <span className="whitespace-pre-line font-normal">{description}</span> : null },
            ]} />
          </SheetSection>

          {photoUrls.length > 0 && (
            <SheetSection label="Images">
              <PhotoThumbs urls={photoUrls} ticketId={ticketId} label="Job photo" limit={5} />
            </SheetSection>
          )}

          <SheetFooter>
            <button type="button" onClick={() => { onAddInfo(); close() }}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
              <MessageSquarePlus size={16} /> Add requested info
            </button>
          </SheetFooter>
        </div>
      )}
    </Modal>
  )
}
