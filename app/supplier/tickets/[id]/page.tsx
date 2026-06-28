export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { ClipboardCheck, FileText, Calendar } from 'lucide-react'
import { SubmitCompletionForm } from '@/components/supplier/SubmitCompletionForm'
import { BackLink } from '@/components/ui/BackLink'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSupplierV3 } from '@/lib/health/guard'
import { loadSlaResolver } from '@/lib/health/data'
import { deriveDueDates } from '@/lib/health/priority'
import { computeTicketSla } from '@/lib/health/sla'
import { isActive } from '@/lib/health/types'
import type { HealthTicket, Priority } from '@/lib/health/types'
import { BreachReason } from '@/components/workflow/BreachReason'
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
    admin.from('ticket_suppliers').select('status, invited_at, decline_reason').eq('ticket_id', t.id).in('supplier_id', supplierIds).maybeSingle(),
    admin.from('quotes').select('id, amount, amount_incl_vat, description, file_url, status, valid_until, created_at').eq('ticket_id', t.id).in('supplier_id', supplierIds).order('created_at', { ascending: false }),
    admin.from('technicians').select('id, name').in('supplier_id', supplierIds).eq('active', true).order('name'),
    admin.from('signoffs').select('id, before_urls, after_urls, coc_url, invoice_url, status, notes, reject_reason, created_at').eq('ticket_id', t.id).in('supplier_id', supplierIds).order('created_at', { ascending: false }),
    admin.from('snags').select('description, required_correction, severity, status, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
  ])
  // When this supplier was requested to quote (their invite, else the ticket's request time).
  const quoteRequestedAt = (invite as any)?.invited_at ?? t.quote_requested_at ?? null
  // Latest completion the supplier submitted (COC + proof-of-completion photos).
  // Most recent snag — explains why a completion was rejected / sent back.
  const latestSnag = ((snagRows ?? []) as any[])[0] ?? null
  const technicians = (technicianRows ?? []) as { id: string; name: string }[]
  // Access: the awarded supplier OR a supplier invited to quote (competitive model).
  const awarded = !!t.supplier_id && supplierIds.includes(t.supplier_id)
  if (!awarded && !invite) redirect('/supplier/tickets')
  // Declined off the ticket (not re-invited) — show "Declined" to the supplier.
  const declinedForMe = !awarded && !!invite && ['declined', 'closed'].includes((invite as any).status)
  const storeName = storeLabel(store?.name, store?.sub_store)

  // SLA due date (final resolution deadline) + overdue state.
  const rules = await loadSlaResolver(admin, t.company_id)
  const now = new Date()
  const dueAt = deriveDueDates(t as HealthTicket, rules(t.priority as Priority)).resolutionDue
  const overdue = isActive(t.status) && now.getTime() > new Date(dueAt).getTime()
  // Supplier-side SLA breach + the pending action that ran past its deadline.
  const sla = computeTicketSla(t as HealthTicket, rules(t.priority as Priority), now)
  const breached = isActive(t.status) && sla.supplierBreached

  // Their latest submitted quote (if any) for this ticket.
  const latestQuote = ((myQuotes ?? []) as any[])[0] ?? null
  // A quote can be (re)submitted while the ticket is in a quote-requesting state
  // (covers both the competitive 'assigned' invite and the legacy 'quote_requested'
  // path) and the invitation isn't closed. Once submitted the ticket moves to
  // 'quoted' and the quote is shown read-only — re-submission only on a revision.
  const revisionRequested = t.status === 'quote_revision'
  const quoteableStatus = ['assigned', 'assessment', 'quote_requested', 'quote_revision'].includes(t.status)
  const inviteOpen = !invite || !['declined', 'closed', 'awarded'].includes(invite.status)
  // Allow a fresh quote, a revision, or a re-quote after the RM declined-to-requote.
  const canSubmitQuote = quoteableStatus && inviteOpen && (!latestQuote || revisionRequested || latestQuote.status === 'declined')
  const declineReason = (invite as any)?.decline_reason ?? null
  // Map a quote's DB status to the read-only summary tone (accepted shows "Approved").
  const quoteStatusOf = (s: string): QuoteSummaryStatus => s === 'accepted' ? 'accepted' : s === 'declined' ? 'declined' : 'pending'

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
            {(() => { const sm = rmStatusMeta(t.status); const cls = declinedForMe ? 'bg-gray-500/15 text-gray-600 dark:text-gray-400' : sm.cls; return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${cls}`}>{declinedForMe ? 'Declined' : sm.label}</span> })()}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <DetailItem label="Store" value={storeName} />
          <DetailItem label="Category" value={t.category ?? 'General'} />
          <DetailItem label="Operational Impact" value={OPERATIONAL_IMPACT_LABELS[t.operational_impact ?? 'none'] ?? 'No operational impact'} />
          <DetailItem label="Logged" value={formatDateTime(t.created_at)} />
          <DueDate dueAt={dueAt} overdue={overdue} now={now.toISOString()} />
          {quoteRequestedAt && <DetailItem label="Quote requested" value={formatDateTime(quoteRequestedAt)} />}
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

        {t.scheduled_at && (
          <div className="flex items-center gap-2.5 rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/30 px-3.5 py-3">
            <Calendar size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-indigo-700 dark:text-indigo-400">Scheduled</p>
              <p className="text-sm font-bold text-[var(--text)]">{formatDateTime(t.scheduled_at)}{t.technician_id && technicians.find(x => x.id === t.technician_id) ? ` · ${technicians.find(x => x.id === t.technician_id)!.name}` : ''}</p>
            </div>
          </div>
        )}
      </Card>

      {breached && <BreachReason nextAction={sla.nextAction} dueAt={sla.nextActionDueAt} owner="Supplier" />}

      <Card className="p-5 space-y-3">
        <h2 className="text-sm font-bold text-[var(--text)]">Next step</h2>
        {latestQuote?.status === 'declined' && (
          <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3 space-y-0.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Quote declined</p>
            {declineReason && <p className="text-sm text-[var(--text)]">{declineReason}</p>}
            <p className="text-sm text-[var(--text-muted)]">{canSubmitQuote ? 'Submit a revised quote below.' : 'The manager is reviewing other suppliers.'}</p>
          </div>
        )}
        {canSubmitQuote && <SendQuoteForm ticketId={t.id} competitive />}
        {t.status === 'accepted' && <ScheduleJobCard ticketId={t.id} priority={t.priority} createdAt={t.created_at} technicians={technicians} />}
        {['in_progress', 'snag_resolved', 'evidence_requested'].includes(t.status) && (
          <SubmitCompletionForm ticketId={t.id} />
        )}
        {t.status === 'in_progress' && <RaiseVariationCard ticketId={t.id} />}
        <WorkflowActions ticketId={t.id} status={t.status} role="supplier" exclude={['schedule', 'submit_completion', 'require_assessment', 'request_quote', 'submit_variation']} />
      </Card>

      {/* Quotes — full history, own block (out of the Next-step box) */}
      {(myQuotes ?? []).length > 0 && (
        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">Quotes</h2>
          {((myQuotes ?? []) as any[]).map((q, i, arr) => (
            <QuoteSummary
              key={q.id}
              title={arr.length > 1 ? `Quote #${arr.length - i}` : 'Your submitted quote'}
              status={quoteStatusOf(q.status)}
              quote={{ id: q.id, amount: q.amount, amountInclVat: q.amount_incl_vat ?? null, description: q.description ?? null, fileUrl: q.file_url ?? null, validUntil: q.valid_until ?? null, createdAt: q.created_at }}
            />
          ))}
        </Card>
      )}

      {/* Completions (COC & POC) — full history, own block. Latest first. */}
      {(signoffRows ?? []).length > 0 && (
        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">Completions (COC &amp; POC)</h2>
          {((signoffRows ?? []) as any[]).map((s, i) => {
            const meta = SIGNOFF_META[s.status] ?? SIGNOFF_META.submitted
            const before = (s.before_urls ?? []) as string[]
            const after = (s.after_urls ?? []) as string[]
            const isLatest = i === 0
            return (
              <div key={s.id} className={`rounded-xl ring-1 ${meta.ring} ${meta.bg} overflow-hidden`}>
                <div className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b ${meta.head}`}>
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)] min-w-0"><ClipboardCheck size={15} className={`${meta.iconCls} shrink-0`} /><span className="truncate">Completion · {formatDateTime(s.created_at)}</span></span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 ${meta.badge}`}>{meta.label}</span>
                </div>
                <div className="p-4 space-y-3">
                  {s.status === 'rejected' && (s.reject_reason || (isLatest && (latestSnag?.description || latestSnag?.required_correction))) && (
                    <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3 space-y-1">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Why it was sent back</p>
                      {(s.reject_reason || (isLatest ? latestSnag?.description : null)) && <p className="text-sm text-[var(--text)]">{s.reject_reason || latestSnag?.description}</p>}
                      {isLatest && latestSnag?.required_correction && <p className="text-sm text-[var(--text-muted)]"><span className="font-medium text-[var(--text)]">Required correction:</span> {latestSnag.required_correction}</p>}
                      {isLatest && latestSnag?.severity && <p className="text-[11px] text-[var(--text-muted)] capitalize">Severity: {String(latestSnag.severity).replace(/_/g, ' ')}</p>}
                    </div>
                  )}
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Proof of completion</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {before.map((u, j) => <a key={`b${j}`} href={u} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C6A35D] underline hover:text-amber-500">Before {j + 1}</a>)}
                      {after.map((u, j) => <a key={`a${j}`} href={u} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C6A35D] underline hover:text-amber-500">After {j + 1}</a>)}
                      {!before.length && !after.length && <span className="text-sm text-[var(--text-faint)]">No photos uploaded</span>}
                    </div>
                  </div>
                  {(s.coc_url || s.invoice_url) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {s.coc_url && <a href={s.coc_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View COC</a>}
                      {s.invoice_url && <a href={s.invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View invoice</a>}
                    </div>
                  )}
                  {s.notes && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Notes</div>
                      <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{s.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </Card>
      )}

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
