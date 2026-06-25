// Read-only quote view — the professional "submitted/accepted quote" card shared
// by the RM and supplier ticket pages. Pure/server-safe (no client hooks).
import { CheckCircle2, FileText, Clock, XCircle } from 'lucide-react'
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
}

const TONE: Record<QuoteSummaryStatus, { ring: string; bg: string; head: string; badge: string; badgeText: string; label: string; icon: typeof CheckCircle2; iconCls: string }> = {
  accepted: { ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/5', head: 'bg-emerald-500/10 border-emerald-500/20', badge: 'bg-emerald-500/15', badgeText: 'text-emerald-700 dark:text-emerald-400', label: 'Accepted', icon: CheckCircle2, iconCls: 'text-emerald-500' },
  awarded:  { ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/5', head: 'bg-emerald-500/10 border-emerald-500/20', badge: 'bg-emerald-500/15', badgeText: 'text-emerald-700 dark:text-emerald-400', label: 'Awarded', icon: CheckCircle2, iconCls: 'text-emerald-500' },
  pending:  { ring: 'ring-[#C6A35D]/40', bg: 'bg-[#C6A35D]/5', head: 'bg-[#C6A35D]/10 border-[#C6A35D]/20', badge: 'bg-[#C6A35D]/15', badgeText: 'text-amber-700 dark:text-[#C6A35D]', label: 'Under review', icon: Clock, iconCls: 'text-[#C6A35D]' },
  declined: { ring: 'ring-red-500/40', bg: 'bg-red-500/5', head: 'bg-red-500/10 border-red-500/20', badge: 'bg-red-500/15', badgeText: 'text-red-700 dark:text-red-400', label: 'Declined', icon: XCircle, iconCls: 'text-red-500' },
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</div>
      <div className="text-sm text-[var(--text)] mt-0.5">{value}</div>
    </div>
  )
}

export function QuoteSummary({ quote, status, title }: { quote: QuoteSummaryData; status: QuoteSummaryStatus; title?: string }) {
  const tone = TONE[status]
  const Icon = tone.icon
  return (
    <div className={`rounded-xl ring-1 ${tone.ring} ${tone.bg} overflow-hidden`}>
      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b ${tone.head}`}>
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)] min-w-0">
          <Icon size={15} className={`${tone.iconCls} shrink-0`} />
          <span className="truncate">{title ?? quote.supplierName ?? 'Quote'}</span>
        </span>
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${tone.badgeText} ${tone.badge} rounded-full px-2 py-0.5 shrink-0`}>{tone.label}</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Item label="Excl. VAT" value={formatCurrency(quote.amount)} />
          <Item label="Incl. VAT" value={quote.amountInclVat ? formatCurrency(quote.amountInclVat) : '—'} />
          <Item label="Submitted" value={formatDateTime(quote.createdAt)} />
          <Item label="Valid until" value={quote.validUntil ? formatDate(quote.validUntil) : 'N/A'} />
        </div>
        {quote.description && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Description</div>
            <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{quote.description}</p>
          </div>
        )}
        {quote.fileUrl && (
          <a href={quote.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline">
            <FileText size={14} /> View attached quote
          </a>
        )}
      </div>
    </div>
  )
}
