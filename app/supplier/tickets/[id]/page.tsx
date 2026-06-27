export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ClipboardCheck, FileText } from 'lucide-react'
import { BackLink } from '@/components/ui/BackLink'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSupplierV3 } from '@/lib/health/guard'
import { loadSlaResolver } from '@/lib/health/data'
import { deriveDueDates } from '@/lib/health/priority'
import { isActive } from '@/lib/health/types'
import type { HealthTicket, Priority } from '@/lib/health/types'
import { Card } from '@/components/exec/ui'
import { WorkflowActions } from '@/components/workflow/WorkflowActions'
import { RmPipeline } from '@/components/regional/RmPipeline'
import { SupplierAttachments } from '@/components/workflow/SupplierAttachments'
import { SendQuoteForm } from '@/components/admin/SendQuoteForm'
import { QuoteSummary, type QuoteSummaryStatus } from '@/components/workflow/QuoteSummary'
import { ScheduleJobCard, RaiseVariationCard } from '@/components/supplier/SupplierJobActions'
import { DueDate } from '@/components/workflow/DueDate'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { formatDateTime, rmStatusMeta, storeLabel, OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'

// Tone for the submitted-completion (sign-off) card — mirrors QuoteSummary.
const SIGNOFF_META: Record<string, { label: string; ring: string; bg: string; head: string; badge: string; iconCls: string }> = {
  accepted: { label: 'Approved', ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/5', head: 'bg-emerald-500/10 border-emerald-500/20', badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', iconCls: 'text-emerald-500' },
  rejected: { label: 'Rejected — re-work', ring: 'ring-red-500/40', bg: 'bg-red-500/5', head: 'bg-red-500/10 border-red-500/20', badge: 'bg-red-500/15 text-red-700 dark:text-red-400', iconCls: 'text-red-500' },
  submitted: { label: 'Under review', ring: 'ring-[#C6A35D]/40', bg: 'bg-[#C6A35D]/5', head: 'bg-[#C6A35D]/10 border-[#C6A35D]/20', badge: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D]', iconCls: 'text-[#C6A35D]' },
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</div>
      <div className="text-sm text-[var(--text)] mt-0.5">{value}</div>
    </div>
  )
}

export default async function SupplierTicketDetailPage({ params }: { params: { id: string } }) {
  const { companyId, supplierIds } = await requireSupplierV3()
  const admin = createAdminClient()
  const { data: t } = await admin.from('tickets').select('*').eq('id', params.id).single()
  if (!t || t.company_id !== companyId) redirect('/supplier/tickets')
  const [{ data: store }, { data: updates }, { data: invite }, { data: myQuotes }, { data: technicianRows }, { data: signoffRows }, { data: snagRows }] = await Promise.all([
    admin.from('stores').select('name, sub_store').eq('id', t.store_id).single(),
    admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('ticket_suppliers').select('status').eq('ticket_id', t.id).in('supplier_id', supplierIds).maybeSingle(),
    admin.from('quotes').select('id, amount, amount_incl_vat, description, file_url, status, valid_until, created_at').eq('ticket_id', t.id).in('supplier_id', supplierIds).order('created_at', { ascending: false }),
    admin.from('technicians').select('id, name').in('supplier_id', supplierIds).eq('active', true).order('name'),
    admin.from('signoffs').select('id, before_urls, after_urls, coc_url, invoice_url, status, notes, reject_reason, created_at').eq('ticket_id', t.id).in('supplier_id', supplierIds).order('created_at', { ascending: false }),
    admin.from('snags').select('description, required_correction, severity, status, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
  ])
  // Latest completion the supplier submitted (COC + proof-of-completion photos).
  const latestSignoff = ((signoffRows ?? []) as any[])[0] ?? null
  // Most recent snag — explains why a completion was rejected / sent back.
  const latestSnag = ((snagRows ?? []) as any[])[0] ?? null
  const technicians = (technicianRows ?? []) as { id: string; name: string }[]
  // Access: the awarded supplier OR a supplier invited to quote (competitive model).
  const awarded = !!t.supplier_id && supplierIds.includes(t.supplier_id)
  if (!awarded && !invite) redirect('/supplier/tickets')
  const storeName = storeLabel(store?.name, store?.sub_store)

  // SLA due date (final resolution deadline) + overdue state.
  const rules = await loadSlaResolver(admin, t.company_id)
  const now = new Date()
  const dueAt = deriveDueDates(t as HealthTicket, rules(t.priority as Priority)).resolutionDue
  const overdue = isActive(t.status) && now.getTime() > new Date(dueAt).getTime()

  // Their latest submitted quote (if any) for this ticket.
  const latestQuote = ((myQuotes ?? []) as any[])[0] ?? null
  // A quote can be (re)submitted while the ticket is in a quote-requesting state
  // (covers both the competitive 'assigned' invite and the legacy 'quote_requested'
  // path) and the invitation isn't closed. Once submitted the ticket moves to
  // 'quoted' and the quote is shown read-only — re-submission only on a revision.
  const revisionRequested = t.status === 'quote_revision'
  const quoteableStatus = ['assigned', 'assessment', 'quote_requested', 'quote_revision'].includes(t.status)
  const inviteOpen = !invite || !['declined', 'closed', 'awarded'].includes(invite.status)
  const canSubmitQuote = quoteableStatus && inviteOpen && (!latestQuote || revisionRequested)
  // Status badge for the read-only quote card.
  const quoteCardStatus: QuoteSummaryStatus =
    awarded || latestQuote?.status === 'accepted' ? 'accepted'
    : latestQuote?.status === 'declined' ? 'declined'
    : 'pending'

  return (
    <div className="space-y-5">
      <BackLink fallbackHref="/supplier/tickets" label="Back to tickets" />

      {/* Progress — bare, no card around it (same as RM) */}
      <div className="px-1 pt-1"><RmPipeline status={t.status} /></div>

      {/* Ticket detail — same layout as the SM view */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {t.job_ref && <p className="text-[11px] font-mono font-semibold tracking-wide text-[var(--text-faint)] mb-0.5">{t.job_ref}</p>}
            <h1 className="text-lg font-bold text-[var(--text)]">{t.title}</h1>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_7rem] gap-1.5 shrink-0 justify-items-end">
            <PriorityBadge priority={t.priority} className="w-full text-center" />
            {(() => { const sm = rmStatusMeta(t.status); return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${sm.cls}`}>{sm.label}</span> })()}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <DetailItem label="Store" value={storeName} />
          <DetailItem label="Category" value={t.category ?? 'General'} />
          <DetailItem label="Operational Impact" value={OPERATIONAL_IMPACT_LABELS[t.operational_impact ?? 'none'] ?? 'No operational impact'} />
          <DetailItem label="Logged" value={formatDateTime(t.created_at)} />
          <DueDate dueAt={dueAt} overdue={overdue} now={now.toISOString()} />
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Description</div>
          <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{t.description}</p>
        </div>

        {Array.isArray(t.photo_urls) && t.photo_urls.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Photos</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {t.photo_urls.map((u: string, i: number) => <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C6A35D] underline hover:text-amber-500">Photo {i + 1}</a>)}
            </div>
          </div>
        )}

        {t.scheduled_at && <p className="text-xs text-[var(--text-muted)]">Scheduled: {formatDateTime(t.scheduled_at)}</p>}
        {t.technician_id && technicians.find(x => x.id === t.technician_id) && <p className="text-xs text-[var(--text-muted)]">Technician: {technicians.find(x => x.id === t.technician_id)!.name}</p>}
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="text-sm font-bold text-[var(--text)]">Next step</h2>
        {canSubmitQuote && <SendQuoteForm ticketId={t.id} competitive />}
        {!canSubmitQuote && latestQuote && (
          <QuoteSummary
            title="Your submitted quote"
            status={quoteCardStatus}
            quote={{ id: latestQuote.id, amount: latestQuote.amount, amountInclVat: latestQuote.amount_incl_vat ?? null, description: latestQuote.description ?? null, fileUrl: latestQuote.file_url ?? null, validUntil: latestQuote.valid_until ?? null, createdAt: latestQuote.created_at }}
          />
        )}
        {t.status === 'accepted' && <ScheduleJobCard ticketId={t.id} priority={t.priority} createdAt={t.created_at} technicians={technicians} />}
        {['in_progress', 'snag_resolved', 'evidence_requested'].includes(t.status) && (
          <Link href={`/supplier/tickets/${t.id}/complete`} className="block w-full text-center py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition">Submit COC &amp; POC</Link>
        )}
        {t.status === 'in_progress' && <RaiseVariationCard ticketId={t.id} />}
        <WorkflowActions ticketId={t.id} status={t.status} role="supplier" exclude={['schedule', 'submit_completion', 'require_assessment', 'request_quote', 'submit_variation']} />
      </Card>

      {/* Submitted completion — COC + proof-of-completion, read-only (mirrors the quote card) */}
      {latestSignoff && (() => {
        const meta = SIGNOFF_META[latestSignoff.status] ?? SIGNOFF_META.submitted
        const before = (latestSignoff.before_urls ?? []) as string[]
        const after = (latestSignoff.after_urls ?? []) as string[]
        return (
          <div className={`rounded-xl ring-1 ${meta.ring} ${meta.bg} overflow-hidden`}>
            <div className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b ${meta.head}`}>
              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)] min-w-0"><ClipboardCheck size={15} className={`${meta.iconCls} shrink-0`} /><span className="truncate">Your submitted completion</span></span>
              <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 ${meta.badge}`}>{meta.label}</span>
            </div>
            <div className="p-4 space-y-3">
              {latestSignoff.status === 'rejected' && (latestSignoff.reject_reason || latestSnag?.description || latestSnag?.required_correction) && (
                <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3 space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Why it was sent back</p>
                  {(latestSignoff.reject_reason || latestSnag?.description) && <p className="text-sm text-[var(--text)]">{latestSignoff.reject_reason || latestSnag?.description}</p>}
                  {latestSnag?.required_correction && <p className="text-sm text-[var(--text-muted)]"><span className="font-medium text-[var(--text)]">Required correction:</span> {latestSnag.required_correction}</p>}
                  {latestSnag?.severity && <p className="text-[11px] text-[var(--text-muted)] capitalize">Severity: {String(latestSnag.severity).replace(/_/g, ' ')}</p>}
                </div>
              )}
              <DetailItem label="Submitted" value={formatDateTime(latestSignoff.created_at)} />
              <div>
                <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Proof of completion</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {before.map((u, i) => <a key={`b${i}`} href={u} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C6A35D] underline hover:text-amber-500">Before {i + 1}</a>)}
                  {after.map((u, i) => <a key={`a${i}`} href={u} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C6A35D] underline hover:text-amber-500">After {i + 1}</a>)}
                  {!before.length && !after.length && <span className="text-sm text-[var(--text-faint)]">No photos uploaded</span>}
                </div>
              </div>
              {(latestSignoff.coc_url || latestSignoff.invoice_url) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {latestSignoff.coc_url && <a href={latestSignoff.coc_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View COC</a>}
                  {latestSignoff.invoice_url && <a href={latestSignoff.invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View invoice</a>}
                </div>
              )}
              {latestSignoff.notes && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Notes</div>
                  <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{latestSignoff.notes}</p>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      <Card className="p-5">
        <h2 className="text-sm font-bold text-[var(--text)] mb-3">Post an update</h2>
        <SupplierAttachments ticketId={t.id} />
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold text-[var(--text)] mb-3">Updates</h2>
        {(updates ?? []).length ? (updates ?? []).map((u: any, i: number) => (
          <div key={i} className="py-2 border-b border-[var(--border)] last:border-0"><p className="text-sm text-[var(--text)]">{u.body}</p><p className="text-[11px] text-[var(--text-faint)]">{u.author_role} · {formatDateTime(u.created_at)}</p></div>
        )) : <p className="text-sm text-[var(--text-faint)]">No updates yet.</p>}
      </Card>
    </div>
  )
}
