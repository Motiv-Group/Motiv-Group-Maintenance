// Shared body for a COC & POC submission — the three-column layout used in the
// Completion tab and review cards on BOTH the supplier and RM ticket pages:
// proof-of-completion photo thumbnails · the certificate/invoice as file cards ·
// the supplier's notes. Pure/server-safe (PhotoThumbs is the only client island).
import type { ReactNode } from 'react'
import { FileText, ExternalLink, Info } from 'lucide-react'
import { PhotoThumbs } from '@/components/ui/PhotoThumbs'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { formatDateTime } from '@/lib/utils'

const GROUP_LABEL = 'mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]'

// Best-effort filename from a (possibly signed) storage URL — strips the
// "{timestamp}-{random}-" prefix the uploader prepends.
function docName(url: string, fallback: string): string {
  try {
    const raw = decodeURIComponent((url.split('?')[0].split('/').pop() || '').trim())
    return raw.replace(/^\d{6,}-[a-z0-9]{4,}-/i, '') || fallback
  } catch { return fallback }
}

function DocCard({ ticketId, url, itemType, itemLabel, uploadedAt }: {
  ticketId: string; url: string; itemType: 'coc' | 'invoice'; itemLabel: string; uploadedAt?: string | null
}) {
  return (
    <div className="rounded-lg bg-[var(--surface)] p-3 ring-1 ring-[var(--border)]">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-red-500/15 text-red-600 dark:text-red-400"><FileText size={20} /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text)]">{docName(url, itemLabel)}</p>
          {uploadedAt && <p className="text-[11px] text-[var(--text-faint)]">Uploaded {formatDateTime(uploadedAt)}</p>}
        </div>
      </div>
      <ViewTrackedLink ticketId={ticketId} itemType={itemType} itemLabel={itemLabel} href={url} className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 transition hover:underline dark:text-blue-400"><ExternalLink size={13} /> View document</ViewTrackedLink>
    </div>
  )
}

// Centered info note shown under a full-width rule at the foot of a submission
// card (e.g. "You will be notified once the Regional Manager has signed off").
export function CompletionFooterNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-1.5 text-center text-[13px] text-[var(--text-muted)]">
      <Info size={14} className="shrink-0 text-[var(--text-faint)]" /> {children}
    </p>
  )
}

export function CompletionBody({ ticketId, beforeUrls = [], afterUrls = [], cocUrl, invoiceUrl, notes, uploadedAt }: {
  ticketId: string
  beforeUrls?: string[]
  afterUrls?: string[]
  cocUrl?: string | null
  invoiceUrl?: string | null
  notes?: string | null
  uploadedAt?: string | null
}) {
  const photos = [...beforeUrls, ...afterUrls]
  // Notes are free text; split on line breaks so multi-line notes read as a list.
  const noteLines = (notes ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  // Three columns separated by thin vertical rules once side-by-side (borders on
  // cols 2-3, padding centres each rule in its gutter); rules drop away when the
  // columns stack on mobile.
  return (
    <div className="grid gap-y-5 md:grid-cols-3">
      {/* Proof of completion — photo thumbnails (tap to open the lightbox). */}
      <div className="md:pr-5">
        <div className={GROUP_LABEL}>Proof of completion{photos.length > 0 && ` (${photos.length} photo${photos.length === 1 ? '' : 's'})`}</div>
        {photos.length
          ? <PhotoThumbs urls={photos} ticketId={ticketId} label="Completion photo" />
          : <span className="text-sm text-[var(--text-faint)]">No photos uploaded</span>}
      </div>

      {/* Certificate of Compliance (COC) + optional invoice — file cards. */}
      <div className="md:border-l md:border-[var(--border)] md:px-5">
        <div className={GROUP_LABEL}>Certificate of Compliance (COC)</div>
        <div className="space-y-2">
          {cocUrl
            ? <DocCard ticketId={ticketId} url={cocUrl} itemType="coc" itemLabel="Completion COC" uploadedAt={uploadedAt} />
            : <span className="text-sm text-[var(--text-faint)]">No certificate uploaded</span>}
          {invoiceUrl && <DocCard ticketId={ticketId} url={invoiceUrl} itemType="invoice" itemLabel="Completion invoice" uploadedAt={uploadedAt} />}
        </div>
      </div>

      {/* Supplier notes. */}
      <div className="md:border-l md:border-[var(--border)] md:pl-5">
        <div className={GROUP_LABEL}>Supplier notes</div>
        {noteLines.length
          ? <ul className="space-y-1.5 text-sm text-[var(--text-muted)]">{noteLines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          : <span className="text-sm text-[var(--text-faint)]">No notes added</span>}
      </div>
    </div>
  )
}
