export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { FileText, Image as ImageIcon, Info } from 'lucide-react'
import { requireIndividual } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { BackLink } from '@/components/ui/BackLink'
import { Card } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { QuoteSummary, type QuoteSummaryStatus } from '@/components/workflow/QuoteSummary'
import { rmStatusMeta, formatDateTime, OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'

export default async function IndividualTicketDetailPage({ params }: { params: { id: string } }) {
  const { userId } = await requireIndividual()
  const admin = createAdminClient()
  const { data: t } = await admin.from('tickets').select('*').eq('id', params.id).single()
  // Individuals only ever see their own standalone jobs.
  if (!t || t.created_by !== userId) redirect('/individual/tickets')

  const [{ data: quotes }, { data: signoffs }] = await Promise.all([
    admin.from('quotes').select('id, amount, amount_incl_vat, description, file_url, status, valid_until, created_at, updated_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('signoffs').select('id, before_urls, after_urls, coc_url, invoice_url, status, notes, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
  ])
  const sm = rmStatusMeta(t.status)
  const photos = Array.isArray(t.photo_urls) ? t.photo_urls as string[] : []
  const quoteStatusOf = (s: string): QuoteSummaryStatus => s === 'accepted' ? 'accepted' : s === 'declined' ? 'declined' : 'pending'
  const acceptedSignoff = ((signoffs ?? []) as any[]).find(s => s.status === 'accepted') ?? null

  return (
    <div className="space-y-5">
      <BackLink fallbackHref="/individual/tickets" label="Back to jobs" />

      <Card className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-bold text-[var(--text)] min-w-0">{t.title}</h1>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <PriorityBadge priority={t.priority} />
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${sm.cls}`}>{sm.label}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Logged</div><div className="text-[var(--text)]">{formatDateTime(t.created_at)}</div></div>
          <div><div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Urgency</div><div className="text-[var(--text)]">{OPERATIONAL_IMPACT_LABELS[t.operational_impact as keyof typeof OPERATIONAL_IMPACT_LABELS] ?? '—'}</div></div>
        </div>
        {t.description && <div><div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Description</div><p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{t.description}</p></div>}
        {photos.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5 flex items-center gap-1.5"><ImageIcon size={12} /> Photos</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {photos.map((u, i) => <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C6A35D] underline hover:text-amber-500">Photo {i + 1}</a>)}
            </div>
          </div>
        )}
      </Card>

      {/* Quotes (read-only in phase 1) */}
      {((quotes ?? []) as any[]).length > 0 && (
        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">Quotes</h2>
          {((quotes ?? []) as any[]).map((q, i, arr) => (
            <QuoteSummary key={q.id} title={arr.length > 1 ? `Quote #${arr.length - i}` : 'Quote'} status={quoteStatusOf(q.status)} collapsible
              quote={{ id: q.id, amount: q.amount, amountInclVat: q.amount_incl_vat ?? null, description: q.description ?? null, fileUrl: q.file_url ?? null, validUntil: q.valid_until ?? null, createdAt: q.created_at, declinedAt: q.updated_at ?? null }} />
          ))}
        </Card>
      )}

      {/* Completion (approved COC & POC) */}
      {acceptedSignoff && (
        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">Completion</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {(acceptedSignoff.after_urls ?? []).map((u: string, i: number) => <a key={`a${i}`} href={u} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C6A35D] underline hover:text-amber-500">After {i + 1}</a>)}
            {acceptedSignoff.coc_url && <a href={acceptedSignoff.coc_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View COC</a>}
          </div>
          {acceptedSignoff.notes && <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{acceptedSignoff.notes}</p>}
        </Card>
      )}

      <div className="rounded-xl bg-[#C6A35D]/10 ring-1 ring-[#C6A35D]/30 p-3.5 flex items-start gap-2.5">
        <Info size={16} className="text-[#C6A35D] shrink-0 mt-0.5" />
        <p className="text-sm text-[var(--text-muted)]">Assigning a supplier, approving quotes and signing off completion are coming to your account shortly.</p>
      </div>
    </div>
  )
}
