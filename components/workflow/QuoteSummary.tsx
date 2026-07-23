// Read-only quote view — the "submitted / accepted quote" card shared by the RM,
// supplier, individual and client ticket pages (tabs + pop-ups). Pure/server-safe.
import type { ReactNode } from 'react'
import { CheckCircle2, FileText, XCircle, ChevronDown, Calendar } from 'lucide-react'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { quoteLabel } from '@/lib/attachment-labels'

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
  /** Human quote reference ("Q-YYYY-NNNNN") — null on pre-migration quotes. */
  quoteRef?: string | null
}

const BADGE: Record<QuoteSummaryStatus, { label: string; cls: string }> = {
  accepted: { label: 'Approved',     cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  awarded:  { label: 'Awarded',      cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  pending:  { label: 'Under review', cls: 'bg-[#f59e0b]/15 text-amber-700 dark:text-[#f59e0b]' },
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

function DateItem({ label, value, suffix, proposed }: { label: string; value: string; suffix?: string | null; proposed?: boolean }) {
  return (
    <div>
      <div className={LABEL}>{label}</div>
      {/* value and suffix are separate nowrap chunks so "date · technician" can break
          BETWEEN them on narrow phones instead of overflowing the column. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-[var(--text)]">
        <Calendar size={14} className="shrink-0 text-[var(--text-faint)]" />
        <span className="whitespace-nowrap">{value}</span>
        {suffix && <span className="whitespace-nowrap text-[var(--text-muted)]">· {suffix}</span>}
        {proposed && <span className="whitespace-nowrap text-[11px] text-amber-600 dark:text-amber-400">(proposed)</span>}
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
      {/* Mobile: amount stacks above the status pill (the row form needs ~210px and
          starves the supplier name at 375px); sm+ keeps the inline row. */}
      <span className="flex shrink-0 items-center gap-2">
        <span className="flex flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-2.5">
          <span className="text-base font-bold tabular-nums text-[var(--text)]">{formatCurrency(quote.amount)}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.cls}`}>{badge.label}</span>
        </span>
        {collapsible && <ChevronDown size={16} className="shrink-0 text-[var(--text-faint)] transition-transform group-open:rotate-180" />}
      </span>
    </>
  )

  const attName = quote.fileUrl ? fileName(quote.fileUrl) : null
  const fileLink = (label: ReactNode, className: string) => quote.fileUrl && (
    ticketId
      ? <ViewTrackedLink ticketId={ticketId} itemType="quote" itemLabel={quoteLabel(quote.supplierName ?? undefined, quote.quoteRef ?? undefined)} href={quote.fileUrl} className={className}>{label}</ViewTrackedLink>
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

      {/* Four info columns. Thin vertical rules separate them once side-by-side
          (borders live on cols 2-4; padding centres each rule in its gutter). On a
          single-column mobile stack the rules drop away and the columns go full-width. */}
      <div className="grid gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Pricing */}
        <div className="sm:pr-5">
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
        <div className="space-y-3 sm:border-l sm:border-[var(--border)] sm:pl-5 lg:pr-5">
          <DateItem label="Submitted" value={formatDateTime(quote.createdAt)} suffix={quote.quoteRef} />
          {schedule && <DateItem label="Proposed visit" value={formatDateTime(schedule.at)} suffix={schedule.technician} proposed={schedule.proposed} />}
        </div>

        {/* Valid until + declined */}
        <div className="space-y-3 sm:pr-5 lg:border-l lg:border-[var(--border)] lg:pl-5">
          <DateItem label="Valid until" value={quote.validUntil ? formatDate(quote.validUntil) : 'N/A'} />
          {status === 'declined' && quote.declinedAt && <DateItem label="Declined" value={formatDateTime(quote.declinedAt)} />}
        </div>

        {/* Attachment — chip that truncates to its column, never overflowing */}
        <div className="min-w-0 sm:border-l sm:border-[var(--border)] sm:pl-5">
          <div className={LABEL}>Attachment</div>
          <div className="mt-1.5">
            {attName
              ? fileLink(<><FileText size={14} className="mt-0.5 shrink-0" /><span className="min-w-0 line-clamp-2 break-all sm:line-clamp-none sm:truncate">{attName}</span></>, 'inline-flex max-w-full min-w-0 items-start gap-1.5 rounded-lg bg-blue-500/10 px-2.5 py-1.5 text-sm font-medium text-blue-600 ring-1 ring-blue-500/25 transition hover:bg-blue-500/15 dark:text-blue-400 sm:items-center')
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
