export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { BackLink } from '@/components/ui/BackLink'
import { CheckCircle2, FileText, Calendar } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireRegionalV3 } from '@/lib/health/guard'
import { loadSlaResolver } from '@/lib/health/data'
import { deriveDueDates } from '@/lib/health/priority'
import { computeTicketSla } from '@/lib/health/sla'
import { isActive } from '@/lib/health/types'
import type { HealthTicket, Priority } from '@/lib/health/types'
import { BreachReason } from '@/components/workflow/BreachReason'
import { Card } from '@/components/exec/ui'
import { WorkflowActions } from '@/components/workflow/WorkflowActions'
import { RmPipeline } from '@/components/regional/RmPipeline'
import { AssignSuppliersButton, RequestInfoButton, RmEditTicketForm, SupplierStatusList, QuoteReviewCard, CancelTicketCard, ApproveSignoffCard, ReQuoteButton } from '@/components/regional/RmTicketActions'
import { DueDate } from '@/components/workflow/DueDate'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { EditedLine } from '@/components/ui/EditedLine'
import { AuditTrail } from '@/components/ui/AuditTrail'
import { formatCurrency, formatDateTime, formatDate, rmStatusMeta, storeLabel, OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</div>
      <div className="text-sm text-[var(--text)] mt-0.5">{value}</div>
    </div>
  )
}

export default async function RegionalTicketDetailPage({ params }: { params: { id: string } }) {
  const { companyId, regionIds } = await requireRegionalV3()
  const admin = createAdminClient()
  const { data: t } = await admin.from('tickets').select('*').eq('id', params.id).single()
  if (!t || !t.region_id || !regionIds.includes(t.region_id)) redirect('/regional/tickets')

  const [{ data: store }, { data: quotes }, { data: updates }, { data: signoffs }, { data: suppliers }, { data: variations }, { data: snags }, { data: invites }, { data: ratingRows }] = await Promise.all([
    admin.from('stores').select('name, sub_store').eq('id', t.store_id).single(),
    admin.from('quotes').select('id, supplier_id, amount, amount_incl_vat, description, file_url, status, valid_until, created_at, updated_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('signoffs').select('id, status, before_urls, after_urls, coc_url, invoice_url, notes, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('suppliers').select('id, company_name').eq('company_id', companyId).eq('active', true).order('company_name'),
    admin.from('ticket_variations').select('description, amount, status, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('snags').select('description, status, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('ticket_suppliers').select('supplier_id, status, invited_at, decline_reason, suppliers(company_name)').eq('ticket_id', t.id),
    admin.from('ratings').select('supplier_id, score').eq('company_id', companyId),
  ])
  const storeName = store ? storeLabel(store.name, store.sub_store) : 'Store'
  const editorName = t.edited_by ? ((await admin.from('user_profiles').select('full_name').eq('id', t.edited_by).single()).data?.full_name ?? null) : null
  const allSignoffs = (signoffs ?? []) as any[]
  const pendingSignoff = allSignoffs.find(s => ['submitted', 'awaiting_regional', 'awaiting_store'].includes(s.status)) ?? null
  const acceptedSignoff = allSignoffs.find(s => s.status === 'accepted') ?? null

  // SLA due date (final resolution deadline) + overdue state.
  const rules = await loadSlaResolver(admin, t.company_id)
  const now = new Date()
  const dueAt = deriveDueDates(t as HealthTicket, rules(t.priority as Priority)).resolutionDue
  const overdue = isActive(t.status) && now.getTime() > new Date(dueAt).getTime()
  // Dual-SLA result → breach reason (which pending action ran past its deadline).
  const sla = computeTicketSla(t as HealthTicket, rules(t.priority as Priority), now)
  const breached = isActive(t.status) && (sla.supplierBreached || sla.internalBreached)
  const breachOwner = sla.delayOwner === 'supplier' ? 'Supplier' : sla.delayOwner === 'store' ? 'Store' : 'Regional Manager (internal)'

  // Avg star rating per supplier, so the RM sees each contractor's record when assigning.
  const ratingAgg = new Map<string, { sum: number; n: number }>()
  for (const r of (ratingRows ?? []) as any[]) {
    if (!r.supplier_id) continue
    const a = ratingAgg.get(r.supplier_id) ?? { sum: 0, n: 0 }; a.sum += Number(r.score); a.n++; ratingAgg.set(r.supplier_id, a)
  }
  const supplierList = (suppliers ?? []).map((s: any) => {
    const ra = ratingAgg.get(s.id)
    return { id: s.id, name: s.company_name, avgRating: ra ? ra.sum / ra.n : 5, ratingCount: ra ? ra.n : 0 }
  })
  const nameById = new Map<string, string>(supplierList.map(s => [s.id, s.name]))
  for (const inv of (invites ?? []) as any[]) if (inv.suppliers?.company_name) nameById.set(inv.supplier_id, inv.suppliers.company_name)
  const declineReasonBy = new Map<string, string>()
  for (const inv of (invites ?? []) as any[]) if (inv.decline_reason) declineReasonBy.set(inv.supplier_id, inv.decline_reason)
  const supplierRows = ((invites ?? []) as any[]).map(inv => ({ name: inv.suppliers?.company_name ?? nameById.get(inv.supplier_id) ?? 'Supplier', status: inv.status as string, invitedAt: inv.invited_at ?? null }))
  const mapQuote = (q: any) => ({
    id: q.id, supplierName: nameById.get(q.supplier_id) ?? 'Supplier', amount: q.amount,
    amountInclVat: q.amount_incl_vat ?? null, description: q.description ?? null, fileUrl: q.file_url ?? null,
    validUntil: q.valid_until ?? null, createdAt: q.created_at, declineReason: declineReasonBy.get(q.supplier_id) ?? null,
  })
  const reviewQuotes = ((quotes ?? []) as any[]).filter(q => q.status === 'pending').map(mapQuote)
  const acceptedQuotes = ((quotes ?? []) as any[]).filter(q => q.status === 'accepted').map(mapQuote)
  const declinedQuotes = ((quotes ?? []) as any[]).filter(q => q.status === 'declined').map(mapQuote)
  const isTerminal = ['completed', 'cancelled', 'declined'].includes(t.status)
  const canAssign = ['open', 'info_requested'].includes(t.status)
  // Cancelling is only allowed up to (and including) quote review — once a quote
  // is accepted (status 'accepted' or later), the job is committed.
  const canCancel = ['open', 'info_requested', 'assigned', 'assessment', 'quote_requested', 'quoted', 'quote_revision'].includes(t.status)
  const canEdit = ['open', 'info_requested'].includes(t.status)
  const hasQuoteBlock = supplierRows.length > 0 || reviewQuotes.length > 0 || acceptedQuotes.length > 0 || declinedQuotes.length > 0 || (variations ?? []).length > 0
  // A declined quote means the ticket is "re-opened" — true through the whole
  // commercial phase (incl. a stale 'quoted'), until awarded/scheduled or closed.
  const reQuote = declinedQuotes.length > 0 && ['open', 'info_requested', 'assigned', 'assessment', 'quote_requested', 'quoted', 'quote_revision'].includes(t.status)
  // "Info added" = the SM resubmitted after an info request (back at open, reason kept).
  const rmInfoAdded = t.status === 'open' && !!t.info_request_reason

  return (
    <div className="space-y-5">
      <BackLink fallbackHref="/regional/tickets" label="Back to tickets" />

      {/* Progress — bare, no card around it */}
      <div className="px-1 pt-1"><RmPipeline status={t.status} /></div>

      {/* Ticket detail — structured, mirrors the SM layout */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {t.job_ref && <p className="text-[11px] font-mono font-semibold tracking-wide text-[var(--text-faint)] mb-0.5">{t.job_ref}</p>}
            <h1 className="text-lg font-bold text-[var(--text)]">{t.title}</h1>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_7rem] gap-1.5 justify-items-end">
              <PriorityBadge priority={t.priority} className="w-full text-center" />
              {(() => {
                const sm = rmStatusMeta(t.status)
                const label = reQuote ? 'Re-open' : rmInfoAdded ? 'Info added' : sm.label
                const cls = reQuote ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : rmInfoAdded ? 'bg-teal-500/15 text-teal-700 dark:text-teal-400' : sm.cls
                return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${cls}`}>{label}</span>
              })()}
            </div>
            {canEdit && <RmEditTicketForm ticketId={t.id} initial={{ title: t.title, category: t.category ?? 'General', impact: t.operational_impact ?? 'none', priority: t.priority, description: t.description }} />}
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
              {t.photo_urls.map((u: string, i: number) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C6A35D] underline hover:text-amber-500">Photo {i + 1}</a>
              ))}
            </div>
          </div>
        )}

        {t.info_request_reason && <p className="text-xs text-amber-600 dark:text-amber-400">Info requested: {t.info_request_reason}</p>}
        {t.scheduled_at && (
          <div className="flex items-center gap-2.5 rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/30 px-3.5 py-3">
            <Calendar size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-indigo-700 dark:text-indigo-400">Scheduled</p>
              <p className="text-sm font-bold text-[var(--text)]">{formatDateTime(t.scheduled_at)}</p>
            </div>
          </div>
        )}

        <EditedLine at={t.edited_at} by={editorName} />
      </Card>

      {(t.status === 'cancelled' || t.status === 'declined') && (
        <div className="rounded-2xl bg-red-500/10 ring-1 ring-red-500/40 p-5 space-y-1">
          <p className="text-sm font-bold text-red-700 dark:text-red-400">Ticket {t.status === 'declined' ? 'declined' : 'cancelled'}</p>
          <p className="text-sm text-[var(--text-muted)]">{t.cancellation_reason || `This ticket was ${t.status === 'declined' ? 'declined' : 'cancelled'}.`}</p>
        </div>
      )}

      {breached && <BreachReason nextAction={sla.nextAction} dueAt={sla.nextActionDueAt} owner={breachOwner} />}

      {reQuote && (
        <div className="rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/40 p-4 space-y-0.5">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Re-quote</p>
          <p className="text-sm text-[var(--text-muted)]">A previous quote was declined. Pick one of the remaining quotes below, or assign a different supplier.</p>
        </div>
      )}

      {pendingSignoff && (
        <Card className="p-5">
          <h2 className="text-sm font-bold text-[var(--text)] mb-2">Submitted evidence</h2>
          <div className="flex flex-wrap gap-3 text-xs">
            {(pendingSignoff.before_urls ?? []).map((u: string, i: number) => <a key={`b${i}`} href={u} target="_blank" className="text-[#C6A35D] underline">Before {i + 1}</a>)}
            {(pendingSignoff.after_urls ?? []).map((u: string, i: number) => <a key={`a${i}`} href={u} target="_blank" className="text-[#C6A35D] underline">After {i + 1}</a>)}
            {pendingSignoff.coc_url && <a href={pendingSignoff.coc_url} target="_blank" className="text-[#C6A35D] underline">COC</a>}
          </div>
        </Card>
      )}

      {/* Approved COC & POC — read-only block (mirrors the accepted-quote card) */}
      {acceptedSignoff && (
        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">COC &amp; POC</h2>
          <div className="rounded-xl ring-1 ring-emerald-500/40 bg-emerald-500/5 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20">
              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]"><CheckCircle2 size={15} className="text-emerald-500 shrink-0" /> Approved completion</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 rounded-full px-2 py-0.5">Approved</span>
            </div>
            <div className="p-4 space-y-3">
              <DetailItem label="Submitted" value={formatDateTime(acceptedSignoff.created_at)} />
              <div>
                <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Proof of completion</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {(acceptedSignoff.before_urls ?? []).map((u: string, i: number) => <a key={`b${i}`} href={u} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C6A35D] underline hover:text-amber-500">Before {i + 1}</a>)}
                  {(acceptedSignoff.after_urls ?? []).map((u: string, i: number) => <a key={`a${i}`} href={u} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C6A35D] underline hover:text-amber-500">After {i + 1}</a>)}
                  {!(acceptedSignoff.before_urls ?? []).length && !(acceptedSignoff.after_urls ?? []).length && <span className="text-sm text-[var(--text-faint)]">No photos</span>}
                </div>
              </div>
              {(acceptedSignoff.coc_url || acceptedSignoff.invoice_url) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {acceptedSignoff.coc_url && <a href={acceptedSignoff.coc_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View COC</a>}
                  {acceptedSignoff.invoice_url && <a href={acceptedSignoff.invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View invoice</a>}
                </div>
              )}
              {acceptedSignoff.notes && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Notes</div>
                  <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{acceptedSignoff.notes}</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-bold text-[var(--text)]">Actions</h2>

        {reQuote && <p className="text-xs text-[var(--text-muted)]">A quote was declined and the ticket re-opened. You can ask a declined supplier to re-quote (see <span className="font-medium text-[var(--text)]">Declined / not selected quotes</span> below), assign a different supplier, or cancel the ticket if the issue is resolved.</p>}

        {/* Primary actions — equal-size, side by side: Assign (green) · Request info (amber) · Cancel (red) */}
        {!isTerminal && (canAssign || canCancel) && (
          <div className="flex gap-2">
            {(canAssign || reQuote) && <AssignSuppliersButton ticketId={t.id} suppliers={supplierList} />}
            {canAssign && <RequestInfoButton ticketId={t.id} />}
            {canCancel && <CancelTicketCard ticketId={t.id} />}
          </div>
        )}

        {/* Accept sign-off with a required supplier rating */}
        {t.status === 'submitted_for_signoff' && <ApproveSignoffCard ticketId={t.id} />}

        {/* Remaining lifecycle actions (request evidence, snag, variation, close) */}
        <WorkflowActions
          ticketId={t.id} status={t.status} role="regional_manager"
          suppliers={supplierList}
          exclude={['validate', 'reject', 'request_info', 'request_quote', 'require_assessment', 'approve_quote', 'reject_quote', 'request_revision', 'proceed_no_quote', 'schedule', 'approve']}
        />
      </Card>

      {/* Quotes & Variation Orders — suppliers requested, quotes to review, VOs */}
      {hasQuoteBlock && (
        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-bold text-[var(--text)]">Quotes &amp; Variation Orders</h2>
          {supplierRows.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Suppliers requested</h3>
              <SupplierStatusList rows={supplierRows} />
            </div>
          )}
          {reviewQuotes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Quotes for review</h3>
              <QuoteReviewCard ticketId={t.id} quotes={reviewQuotes} />
            </div>
          )}
          {acceptedQuotes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Accepted quote</h3>
              {acceptedQuotes.map(q => (
                <div key={q.id} className="rounded-xl ring-1 ring-emerald-500/40 bg-emerald-500/5 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20">
                    <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)] min-w-0"><CheckCircle2 size={15} className="text-emerald-500 shrink-0" /><span className="truncate">{q.supplierName}</span></span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 rounded-full px-2 py-0.5 shrink-0">Accepted</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <DetailItem label="Excl. VAT" value={formatCurrency(q.amount)} />
                      <DetailItem label="Incl. VAT" value={q.amountInclVat ? formatCurrency(q.amountInclVat) : '—'} />
                      <DetailItem label="Received" value={formatDateTime(q.createdAt)} />
                      <DetailItem label="Valid until" value={q.validUntil ? formatDate(q.validUntil) : 'N/A'} />
                    </div>
                    {q.description && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Description</div>
                        <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{q.description}</p>
                      </div>
                    )}
                    {q.fileUrl && <a href={q.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View attached quote</a>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {declinedQuotes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Declined / not selected quotes</h3>
              {declinedQuotes.map(q => (
                <details key={q.id} className="rounded-xl ring-1 ring-[var(--border)] overflow-hidden">
                  <summary className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--hover)] transition">
                    <span className="text-sm font-semibold text-[var(--text)] min-w-0 truncate">{q.supplierName}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-sm text-[var(--text)] tabular-nums">{formatCurrency(q.amount)}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400 bg-red-500/15 rounded-full px-2 py-0.5">Declined</span>
                    </span>
                  </summary>
                  <div className="border-t border-[var(--border)] p-4 space-y-3">
                    {q.declineReason && (
                      <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Decline reason</p>
                        <p className="text-sm text-[var(--text)]">{q.declineReason}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <DetailItem label="Excl. VAT" value={formatCurrency(q.amount)} />
                      <DetailItem label="Incl. VAT" value={q.amountInclVat ? formatCurrency(q.amountInclVat) : '—'} />
                      <DetailItem label="Received" value={formatDateTime(q.createdAt)} />
                      <DetailItem label="Valid until" value={q.validUntil ? formatDate(q.validUntil) : 'N/A'} />
                    </div>
                    {q.description && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Description</div>
                        <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{q.description}</p>
                      </div>
                    )}
                    {q.fileUrl && <a href={q.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View attached quote</a>}
                    {!isTerminal && <div className="pt-1"><ReQuoteButton ticketId={t.id} quoteId={q.id} /></div>}
                  </div>
                </details>
              ))}
            </div>
          )}
          {(variations ?? []).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Variation orders</h3>
              {(variations ?? []).map((v: any, i: number) => (
                <div key={i} className="py-2 border-b border-[var(--border)] last:border-0 flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="text-sm text-[var(--text)]">{v.description}</p><p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(v.created_at)}</p></div>
                  <span className="text-xs text-[var(--text)] whitespace-nowrap">{v.amount ? formatCurrency(v.amount) : '—'} · {v.status}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {(snags ?? []).length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-bold text-[var(--text)] mb-3">Snags</h2>
          {(snags ?? []).map((s: any, i: number) => (
            <div key={i} className="py-2 border-b border-[var(--border)] last:border-0 flex items-start justify-between gap-2">
              <p className="text-sm text-[var(--text)] min-w-0">{s.description ?? 'Snag'}</p>
              <span className="text-xs text-[var(--text)] capitalize whitespace-nowrap">{String(s.status).replace(/_/g, ' ')}</span>
            </div>
          ))}
        </Card>
      )}

      <AuditTrail ticket={{
        createdAt: t.created_at, status: t.status, updatedAt: t.updated_at,
        quoteRequestedAt: t.quote_requested_at, quoteSubmittedAt: t.quote_submitted_at,
        quoteApprovedAt: t.quote_decision_status === 'approved' ? t.quote_decided_at : null,
        scheduledAt: t.scheduled_at, completedAt: t.completed_at,
        editedAt: t.edited_at, editedByName: editorName, cancellationReason: t.cancellation_reason,
        quotes: (quotes ?? []) as any[], signoffs: allSignoffs, updates: (updates ?? []) as any[],
      }} />
    </div>
  )
}
