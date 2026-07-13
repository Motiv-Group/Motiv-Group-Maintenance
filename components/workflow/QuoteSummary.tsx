// Read-only quote view — the "submitted / accepted quote" card shared by the RM,
// supplier, individual and client ticket pages (tabs + pop-ups). Pure/server-safe.
import type { ReactNode } from 'react'
import { CheckCircle2, FileText, XCircle, ChevronDown, Calendar } from 'lucide-react'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'

export type QuoteSummaryStatus = 'pending' | 'accepted' | 'declined' | 'awarded'

export interface QuoteSummaryData {
  id: string
  supplierName?: string | null
  amount: number
  amountInclVat?: number | null
  description?: string | null
  fileUrl?: string | null
  validUntil?: string | null
  createdAt: string
  /** When the quote was declined — shown on a declined card. */
  declinedAt?: string | null
}

const BADGE: Record<QuoteSummaryStatus, { label: string; cls: string }> = {
  accepted: { label: 'Approved',     cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  awarded:  { label: 'Awarded',      cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  pending:  { label: 'Under review', cls: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D]' },
  declined: { label: 'Declined',     cls: 'bg-red-500/15 text-red-700 dark:text-red-400' },
}

const LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]'

/** Best-effort attachment filename from a (possibly signed) storage URL — strips
 *  the "{timestamp}-{random}-" prefix the uploader prepends. */
function fileName(url: string): string {
  try {
    const raw = decodeURIComponent((url.split('?')[0].split('/').pop() || '').trim())
    return raw.replace(/^\d{6,}-[a-z0-9]{4,}-/i, '') || raw || 'Quote'
  } catch { return 'Quote' }
}

function DateItem({ label, value, proposed }: { label: string; value: string; proposed?: boolean }) {
  return (
    <div>
      <div className={LABEL}>{label}</div>
      <div className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text)]">
        <Calendar size={14} className="shrink-0 text-[var(--text-faint)]" />
        <span>{value}</span>
        {proposed && <span className="text-[11px] text-amber-600 dark:text-amber-400">(proposed)</span>}
      </div>
    </div>
  )
}

export interface QuoteSchedule { at: string; proposed?: boolean; technician?: string | null; audience?: 'rm' | 'supplier' }

export function QuoteSummary({ quote, status, title, schedule, collapsible = false, declineReason, ticketId }: { quote: QuoteSummaryData; status: QuoteSummaryStatus; title?: string; schedule?: QuoteSchedule | null; collapsible?: boolean; declineReason?: string | null; ticketId?: string }) {
  const badge = BADGE[status]
  const Icon = status === 'declined' ? XCircle : CheckCircle2
  const iconCls = status === 'declined' ? 'text-[var(--text-faint)]' : 'text-emerald-500'

  const heading = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <Icon size={17} className={`shrink-0 ${iconCls}`} />
        <span className="truncate text-sm font-bold text-[var(--text)]">{title ?? quote.supplierName ?? 'Quote'}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2.5">
        <span className="text-base font-bold tabular-nums text-[var(--text)]">{formatCurrency(quote.amount)}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.cls}`}>{badge.label}</span>
        {collapsible && <ChevronDown size={16} className="text-[var(--text-faint)] transition-transform group-open:rotate-180" />}
      </span>
    </>
  )

  const attName = quote.fileUrl ? fileName(quote.fileUrl) : null
  const fileLink = (label: ReactNode, className: string) => quote.fileUrl && (
    ticketId
      ? <ViewTrackedLink ticketId={ticketId} itemType="quote" itemLabel={`${title ?? quote.supplierName ?? 'Quote'} attachment`} href={quote.fileUrl} className={className}>{label}</ViewTrackedLink>
      : <a href={quote.fileUrl} target="_blank" rel="noopener noreferrer" className={className}>{label}</a>
  )

  const body = (
    <>
      {status === 'declined' && declineReason && (
        <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Decline reason</p>
          <p className="text-sm font-medium text-red-700 dark:text-red-400">{declineReason}</p>
        </div>
      )}

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Pricing */}
        <div>
          <div className={LABEL}>Pricing</div>
          <div className="mt-1.5">
            <div className="text-[11px] text-[var(--text-faint)]">Excl. VAT</div>
            <div className="text-sm font-semibold text-[var(--text)]">{formatCurrency(quote.amount)}</div>
          </div>
          <div className="mt-2 border-t border-[var(--border)] pt-2">
            <div className="text-[11px] text-[var(--text-faint)]">Incl. VAT</div>
            <div className="text-sm font-semibold text-[var(--text)]">{quote.amountInclVat ? formatCurrency(quote.amountInclVat) : '—'}</div>
          </div>
        </div>

        {/* Submitted + proposed visit */}
        <div className="space-y-3">
          <DateItem label="Submitted" value={formatDateTime(quote.createdAt)} />
          {schedule && <DateItem label="Proposed visit" value={`${formatDateTime(schedule.at)}${schedule.technician ? ` · ${schedule.technician}` : ''}`} proposed={schedule.proposed} />}
        </div>

        {/* Valid until + declined */}
        <div className="space-y-3">
          <DateItem label="Valid until" value={quote.validUntil ? formatDate(quote.validUntil) : 'N/A'} />
          {status === 'declined' && quote.declinedAt && <DateItem label="Declined" value={formatDateTime(quote.declinedAt)} />}
        </div>

        {/* Attachment */}
        <div>
          <div className={LABEL}>Attachment</div>
          <div className="mt-1.5">
            {attName
              ? fileLink(<span className="inline-flex min-w-0 items-center gap-1.5"><FileText size={14} className="shrink-0" /><span className="truncate">{attName}</span></span>, 'inline-flex max-w-[240px] items-center text-sm font-medium text-blue-600 hover:underline dark:text-blue-400')
              : <span className="text-sm text-[var(--text-faint)]">—</span>}
          </div>
        </div>
      </div>

      {quote.description && (
        <div>
          <div className={LABEL}>Scope of work</div>
          <p className="mt-1 text-sm text-[var(--text-muted)] whitespace-pre-line">{quote.description}</p>
        </div>
      )}

      {quote.fileUrl && fileLink('View full quote →', 'inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400')}
    </>
  )

  if (collapsible) {
    return (
      <details className="group overflow-hidden rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-[var(--hover)]">{heading}</summary>
        <div className="space-y-4 border-t border-[var(--border)] px-4 py-4">{body}</div>
      </details>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">{heading}</div>
      <div className="space-y-4 px-4 py-4">{body}</div>
    </div>
  )
}
