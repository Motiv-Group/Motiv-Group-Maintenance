'use client'

// Quote review/comparison actions: quote panel, comparison pop-up, review
// buttons/cards and the re-quote request.
import { useState, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Info, FileText, ChevronRight, Store, ShieldCheck, Clock, Calendar } from 'lucide-react'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { QuoteSummary } from '@/components/workflow/QuoteSummary'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { Modal } from './modal'
import { post, errMsg, PANEL_META } from './shared'

// ── Quote review (approve / decline with reason) ────────────────
export interface ReviewQuote { id: string; supplierName: string; amount: number; amountInclVat: number | null; description: string | null; fileUrl: string | null; createdAt: string; proposedScheduleAt?: string | null }
const DECLINE_REASONS = ['Price too high', 'Scope unclear / incomplete', 'Choosing another supplier', 'Lead time too long', 'Other']
// Choosing someone else ≠ asking this supplier to revise — this reason never offers the re-quote checkbox.
const NO_REQUOTE_REASON = 'Choosing another supplier'

export function QuoteReviewCard({ ticketId, quotes }: { ticketId: string; quotes: ReviewQuote[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [declineFor, setDeclineFor] = useState<string | null>(null)
  const [approveFor, setApproveFor] = useState<string | null>(null)
  const [reason, setReason] = useState(DECLINE_REASONS[0])
  const [other, setOther] = useState('')
  const [err, setErr] = useState('')
  if (!quotes.length) return <p className="text-sm text-[var(--text-faint)]">No quotes submitted yet.</p>

  async function decide(quoteId: string, action: 'approve' | 'decline') {
    setBusy(quoteId); setErr('')
    const declineReason = action === 'decline' ? (reason === 'Other' ? (other.trim() || 'Other') : reason) : undefined
    try {
      // Declining just declines the quote (with the reason) — the supplier is NOT
      // auto-asked to re-quote; that only happens via the "Ask to re-quote" button.
      await post(`/api/tickets/${ticketId}/quote-decision`, { action, quoteId, reason: declineReason })
      router.refresh()
    }
    catch (e) { setErr(errMsg(e)); setBusy(null) }
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'
  return (
    <div className="space-y-3">
      {quotes.map(q => (
        <div key={q.id} className="rounded-xl ring-1 ring-[var(--border)] p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[var(--text)] min-w-0 truncate">{q.supplierName}</span>
            <span className="text-base font-bold text-[var(--text)] shrink-0">{formatCurrency(q.amount)}</span>
          </div>
          <p className="text-[11px] text-[var(--text-faint)]">Received {formatDateTime(q.createdAt)}{q.amountInclVat ? ` · incl VAT ${formatCurrency(q.amountInclVat)}` : ''}</p>
          {q.proposedScheduleAt && (
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/30 px-2.5 py-1 text-[13px]">
              <CalendarClock size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="text-[var(--text-muted)]">Proposed visit</span>
              <span className="font-semibold text-[var(--text)]">{formatDateTime(q.proposedScheduleAt)}</span>
            </div>
          )}
          {q.description && <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{q.description}</p>}
          {q.fileUrl && <ViewTrackedLink ticketId={ticketId} itemType="quote" itemLabel={`${q.supplierName}'s quote`} href={q.fileUrl} className="text-sm text-[#f59e0b] underline">View attachment</ViewTrackedLink>}

          {declineFor === q.id ? (
            <div className="space-y-2 pt-1">
              <select className={input} value={reason} onChange={e => setReason(e.target.value)}>{DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>
              {reason === 'Other' && <textarea className={`${input} min-h-[60px]`} placeholder="Reason…" value={other} onChange={e => setOther(e.target.value)} />}
              <div className="flex gap-2">
                <button onClick={() => decide(q.id, 'decline')} disabled={busy === q.id} className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">Confirm decline</button>
                <button onClick={() => setDeclineFor(null)} className="px-3 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Back</button>
              </div>
            </div>
          ) : approveFor === q.id ? (
            <div className="space-y-2 pt-1">
              <p className="text-sm text-[var(--text)]">Approve and award <span className="font-semibold">{q.supplierName}</span>? Other quotes for this ticket will be declined.</p>
              <div className="flex gap-2">
                <button onClick={() => decide(q.id, 'approve')} disabled={busy === q.id} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">{busy === q.id ? '…' : 'Yes, approve'}</button>
                <button onClick={() => setApproveFor(null)} className="px-3 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 pt-1">
              <button onClick={() => setApproveFor(q.id)} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold">Approve</button>
              <button onClick={() => { setDeclineFor(q.id); setReason(DECLINE_REASONS[0]); setOther('') }} className="px-3 py-2 rounded-lg ring-1 ring-red-500/40 text-red-600 dark:text-red-400 text-sm font-semibold">Decline</button>
            </div>
          )}
        </div>
      ))}
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  )
}

// ── Quoting workspace shown inside the RM's "Next action" block ──────
// One list of the requested suppliers; a supplier that has submitted a quote is
// a clickable item that pops up the full quote (amount, visit, description,
// attachment) with Approve / Decline — those actions live in both the pop-up and
// on the block row. Replaces the standalone "Quotes" section.
export interface QuotePanelQuote { id: string; amount: number; amountInclVat: number | null; description: string | null; fileUrl: string | null; createdAt: string; validUntil?: string | null; proposedScheduleAt?: string | null }
export interface QuotePanelRow { supplierId: string; name: string; requestedAt: string | null; kind: 'waiting' | 'received' | 'accepted' | 'declined'; declineReason: string | null; quote: QuotePanelQuote | null }

export function RmQuotePanel({ ticketId, rows, canReQuote }: { ticketId: string; rows: QuotePanelRow[]; canReQuote: boolean }) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)      // supplierId whose quote pop-up is open
  const [mode, setMode] = useState<'view' | 'approve' | 'decline'>('view')
  const [selectedId, setSelectedId] = useState<string | null>(null)   // radio-selected received quote
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState(DECLINE_REASONS[0])
  const [other, setOther] = useState('')
  const [requote, setRequote] = useState(false)   // decline → also ask for a revised quote
  const [err, setErr] = useState('')
  const active = rows.find(r => r.supplierId === openId) ?? null
  const receivedIds = new Set(rows.filter(r => r.kind === 'received').map(r => r.supplierId))
  const selectedReceived = selectedId && receivedIds.has(selectedId)

  function openModal(id: string, m: 'view' | 'approve' | 'decline' = 'view') { setOpenId(id); setMode(m); setReason(DECLINE_REASONS[0]); setOther(''); setRequote(false); setErr('') }
  async function decide(quoteId: string, action: 'approve' | 'decline') {
    setBusy(true); setErr('')
    const declineReason = action === 'decline' ? (reason === 'Other' ? (other.trim() || 'Other') : reason) : undefined
    try {
      await post(`/api/tickets/${ticketId}/quote-decision`, { action, quoteId, reason: declineReason })
      // If the RM ticked "also ask for a revised quote", re-invite the just-declined
      // supplier straight away (the requote action acts on the now-declined quote).
      if (action === 'decline' && requote) await post(`/api/tickets/${ticketId}/quote-decision`, { action: 'requote', quoteId })
      setBusy(false); setOpenId(null); router.refresh()
    }
    catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'

  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Suppliers &amp; quotes</p>
      {/* Bare stacked rows (no box). Received quotes get a radio — the RM selects
          one, then a single Approve / Decline pair appears (saves space vs a pair
          under every row). */}
      <div className="divide-y divide-[var(--border)]">
        {rows.map(r => {
          const m = PANEL_META[r.kind]
          const isReceived = r.kind === 'received'
          return (
            <div key={r.supplierId} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <label className={`flex items-center gap-2 min-w-0 ${isReceived ? 'cursor-pointer' : ''}`}>
                  {isReceived
                    ? <input type="radio" name={`rmq-${ticketId}`} checked={selectedId === r.supplierId} onChange={() => setSelectedId(r.supplierId)} onClick={() => { if (selectedId === r.supplierId) setSelectedId(null) }} className="h-4 w-4 shrink-0 accent-emerald-600" />
                    : <i className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.dot}`} />}
                  <span className="min-w-0">
                    {/* Wraps to two lines on phones so long supplier names keep their suffix. */}
                    <span className="line-clamp-2 break-words text-sm text-[var(--text)] sm:line-clamp-none sm:block sm:truncate">{r.name}</span>
                    {r.requestedAt && <span className="text-[11px] text-[var(--text-faint)]">requested {formatDateTime(r.requestedAt)}</span>}
                  </span>
                </label>
                {r.quote ? (
                  <button type="button" onClick={() => openModal(r.supplierId)} className={`flex items-center gap-1.5 shrink-0 text-[11px] font-semibold ${m.txt} hover:underline`}>
                    {m.label} · {formatCurrency(r.quote.amount)} <FileText size={13} />
                  </button>
                ) : (
                  <span className={`text-[11px] font-semibold shrink-0 ${m.txt}`}>{m.label}</span>
                )}
              </div>
              {r.kind === 'declined' && r.declineReason && (
                <div className="mt-2 rounded-lg bg-red-500/10 ring-1 ring-red-500/30 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Decline reason</p>
                  <p className="text-sm text-[var(--text)]">{r.declineReason}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* One Approve / Decline pair for the selected received quote. */}
      {selectedReceived && (
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => openModal(selectedId!, 'approve')} className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition">Approve selected</button>
          <button type="button" onClick={() => openModal(selectedId!, 'decline')} className="flex-1 py-2 rounded-lg ring-1 ring-red-500/40 text-red-600 dark:text-red-400 text-xs font-semibold transition hover:bg-red-500/10">Decline selected</button>
        </div>
      )}

      {active?.quote && (
        <Modal title="Review quote" maxWidth="max-w-5xl" onClose={() => setOpenId(null)}>
          <QuoteSummary
            quote={{ id: active.quote.id, supplierName: active.name, amount: active.quote.amount, amountInclVat: active.quote.amountInclVat, description: active.quote.description, fileUrl: active.quote.fileUrl, validUntil: active.quote.validUntil ?? null, createdAt: active.quote.createdAt }}
            status={active.kind === 'accepted' ? 'accepted' : active.kind === 'declined' ? 'declined' : 'pending'}
            title={`${active.name}'s quote`}
            schedule={active.quote.proposedScheduleAt ? { at: active.quote.proposedScheduleAt, proposed: true, audience: 'rm' } : null}
            ticketId={ticketId} declineReason={active.declineReason}
          />

          {active.kind === 'received' && (
            mode === 'decline' ? (
              <div className="space-y-2 pt-1">
                <select className={input} value={reason} onChange={e => { setReason(e.target.value); if (e.target.value === NO_REQUOTE_REASON) setRequote(false) }}>{DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>
                {reason === 'Other' && <textarea className={`${input} min-h-[60px]`} placeholder="Reason…" value={other} onChange={e => setOther(e.target.value)} />}
                {reason !== NO_REQUOTE_REASON && (
                  <label className="flex items-start gap-2 rounded-lg bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-muted)] ring-1 ring-[var(--border)]">
                    <input type="checkbox" checked={requote} onChange={e => setRequote(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                    Also ask this supplier to submit a revised quote
                  </label>
                )}
                <div className="flex gap-2">
                  <button onClick={() => decide(active.quote!.id, 'decline')} disabled={busy} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">Confirm decline</button>
                  <button onClick={() => setMode('view')} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Back</button>
                </div>
              </div>
            ) : mode === 'approve' ? (
              <div className="space-y-2 pt-1">
                <p className="text-sm text-[var(--text)]">Approve and award <span className="font-semibold">{active.name}</span>? Other quotes for this ticket will be declined.</p>
                <div className="flex gap-2">
                  <button onClick={() => decide(active.quote!.id, 'approve')} disabled={busy} className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">{busy ? '…' : 'Yes, approve'}</button>
                  <button onClick={() => setMode('view')} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 pt-1">
                <button onClick={() => setMode('approve')} className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition">Approve</button>
                <button onClick={() => setMode('decline')} className="flex-1 py-2 rounded-lg ring-1 ring-red-500/40 text-red-600 dark:text-red-400 text-sm font-semibold transition hover:bg-red-500/10">Decline</button>
              </div>
            )
          )}
          {active.kind === 'declined' && canReQuote && <div className="pt-1"><ReQuoteButton ticketId={ticketId} quoteId={active.quote.id} /></div>}
          {err && <p className="text-xs text-red-500">{err}</p>}
        </Modal>
      )}
    </div>
  )
}

// ── Quote comparison pop-up (Today "Approve quote") ─────────────────────────
// Compare received quotes side by side, pick one (radio), and approve / decline it.
function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'expired'
  const totalMin = Math.floor(ms / 60000)
  const d = Math.floor(totalMin / 1440), h = Math.floor((totalMin % 1440) / 60), m = totalMin % 60
  return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`
}
function DetailCell({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-[var(--text-faint)]">{icon}</span>
      <span className="min-w-0"><span className="block text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</span><span className="block text-sm text-[var(--text)]">{value}</span></span>
    </div>
  )
}

export function QuoteComparison({ ticketId, rows, onClose }: { ticketId: string; rows: QuotePanelRow[]; onClose: () => void }) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailFor, setDetailFor] = useState<string | null>(null)
  const [declineMode, setDeclineMode] = useState(false)
  const [reason, setReason] = useState(DECLINE_REASONS[0])
  const [other, setOther] = useState('')
  const [requote, setRequote] = useState(false)   // decline → also ask for a revised quote
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const received = rows.filter(r => r.kind === 'received' && r.quote)
  const awaiting = rows.filter(r => r.kind === 'waiting')
  const selected = received.find(r => r.supplierId === selectedId) ?? null

  const soonest = received.map(r => r.quote?.validUntil).filter(Boolean).map(v => new Date(v as string).getTime()).sort((a, b) => a - b)[0]
  // eslint-disable-next-line react-hooks/purity -- cosmetic "valid for" countdown; not hydration-critical
  const validFor = soonest ? fmtCountdown(soonest - Date.now()) : null
  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'

  async function decide(action: 'approve' | 'decline') {
    if (!selected?.quote) return
    setBusy(true); setErr('')
    const declineReason = action === 'decline' ? (reason === 'Other' ? (other.trim() || 'Other') : reason) : undefined
    const qid = selected.quote.id
    try {
      await post(`/api/tickets/${ticketId}/quote-decision`, { action, quoteId: qid, reason: declineReason })
      // Ticked "also ask for a revised quote" → re-invite the just-declined supplier.
      if (action === 'decline' && requote) await post(`/api/tickets/${ticketId}/quote-decision`, { action: 'requote', quoteId: qid })
      router.refresh()
    }
    catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <>
      <p className="-mt-1 text-sm text-[var(--text-muted)]">Compare supplier quotes and approve the best option.</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2.5 text-sm text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {received.length} quote{received.length !== 1 ? 's' : ''} received</span>
          {awaiting.length > 0 && <><span className="text-[var(--text-faint)]">·</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> {awaiting.length} awaiting response</span></>}
        </p>
        {validFor && <p className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">Quotes valid for <span className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400"><Clock size={13} /> {validFor}</span></p>}
      </div>

      {awaiting.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Awaiting quote</p>
          {awaiting.map(r => (
            <div key={r.supplierId} className="flex items-center justify-between gap-3 rounded-xl border-l-4 border-amber-500 bg-[var(--surface)] px-4 py-3 ring-1 ring-[var(--border)]">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"><Clock size={18} /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-bold text-[var(--text)]">{r.name}</span><span className="text-xs font-medium text-amber-600 dark:text-amber-400">Awaiting quote</span>{r.requestedAt && <span className="block text-[11px] text-[var(--text-faint)]">Requested {formatDateTime(r.requestedAt)}</span>}</span>
              </span>
              <span className="shrink-0 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Awaiting</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Received quotes ({received.length})</p>
        {received.map(r => {
          const on = selectedId === r.supplierId
          const q = r.quote!
          return (
            <div key={r.supplierId} className={`rounded-xl bg-[var(--surface)] ring-1 transition ${on ? 'ring-emerald-500' : 'ring-[var(--border)]'}`}>
              <label className="flex cursor-pointer items-start justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 items-start gap-3">
                  {/* Avatar chip is sm+ — phones give its width back to the supplier name. */}
                  <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 sm:grid"><Store size={18} /></span>
                  {/* Name wraps to two lines on phones — long supplier orgs must stay distinguishable when awarding. */}
                  <span className="min-w-0"><span className="line-clamp-2 break-words text-sm font-bold text-[var(--text)] sm:line-clamp-none sm:block sm:truncate">{r.name}</span><span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Quote received</span><span className="block text-[11px] text-[var(--text-faint)]">Received {formatDateTime(q.createdAt)}</span></span>
                </span>
                <span className="flex shrink-0 items-start gap-3">
                  <span className="text-right"><span className="block text-lg font-bold tabular-nums text-[var(--text)]">{formatCurrency(q.amount)}</span><span className="block text-[11px] text-[var(--text-faint)]">excl VAT</span>{q.amountInclVat != null && <span className="hidden text-[11px] text-[var(--text-faint)] sm:block">{formatCurrency(q.amountInclVat)} incl VAT</span>}</span>
                  {q.fileUrl && <FileText size={16} className="mt-0.5 text-emerald-600 dark:text-emerald-400" />}
                  <input type="radio" name="qc" checked={on} onChange={() => setSelectedId(r.supplierId)} onClick={() => { if (selectedId === r.supplierId) setSelectedId(null) }} className="mt-1 h-4 w-4 accent-emerald-600" />
                </span>
              </label>
              <div className="mx-4 grid grid-cols-1 gap-y-2 border-t border-[var(--border)] py-3 sm:grid-cols-2 sm:gap-x-4">
                <DetailCell icon={<Calendar size={14} />} label="Proposed visit" value={q.proposedScheduleAt ? formatDateTime(q.proposedScheduleAt) : '—'} />
                <DetailCell icon={<ShieldCheck size={14} />} label="Valid until" value={q.validUntil ? formatDate(q.validUntil) : 'N/A'} />
              </div>
              <div className="border-t border-[var(--border)]">
                <button type="button" onClick={() => setDetailFor(detailFor === r.supplierId ? null : r.supplierId)} className="flex w-full items-center justify-center gap-1 py-2.5 text-sm font-semibold text-emerald-600 transition hover:bg-[var(--hover)] dark:text-emerald-400">View quote details <ChevronRight size={15} className={detailFor === r.supplierId ? 'rotate-90 transition-transform' : 'transition-transform'} /></button>
                {detailFor === r.supplierId && <div className="px-4 pb-4"><QuoteSummary quote={{ id: q.id, supplierName: r.name, amount: q.amount, amountInclVat: q.amountInclVat, description: q.description, fileUrl: q.fileUrl, validUntil: q.validUntil ?? null, createdAt: q.createdAt }} status="pending" title={`${r.name}'s quote`} schedule={q.proposedScheduleAt ? { at: q.proposedScheduleAt, proposed: true } : null} ticketId={ticketId} /></div>}
              </div>
            </div>
          )
        })}
        {!received.length && <p className="rounded-xl bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--text-faint)] ring-1 ring-[var(--border)]">No quotes received yet.</p>}
      </div>

      {declineMode && selected && (
        <div className="space-y-2 rounded-xl bg-[var(--input-bg)] p-3 ring-1 ring-[var(--border)]">
          <p className="text-sm text-[var(--text)]">Decline <span className="font-semibold">{selected.name}</span>&apos;s quote — choose a reason:</p>
          <select className={input} value={reason} onChange={e => { setReason(e.target.value); if (e.target.value === NO_REQUOTE_REASON) setRequote(false) }}>{DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>
          {reason === 'Other' && <textarea className={`${input} min-h-[60px]`} placeholder="Reason…" value={other} onChange={e => setOther(e.target.value)} />}
          {reason !== NO_REQUOTE_REASON && (
            <label className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
              <input type="checkbox" checked={requote} onChange={e => setRequote(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
              Also ask this supplier to submit a revised quote
            </label>
          )}
        </div>
      )}

      {awaiting.length > 0 && selected && !declineMode && (
        <div className="flex items-start gap-2.5 rounded-xl bg-blue-500/10 px-3.5 py-3 ring-1 ring-blue-500/25">
          <Info size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-[var(--text-muted)]">Approving the selected quote will withdraw the outstanding request{awaiting.length === 1 ? ` from ${awaiting[0].name}` : 's'}.</p>
        </div>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}

      {/* Footer CTAs stack full-width on phones (three ~150px buttons wrap unevenly
          at 375px); sm+ keeps the flex-wrap row. */}
      <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3 sm:flex-row sm:flex-wrap">
        <button type="button" onClick={onClose} disabled={busy} className="w-full rounded-xl py-2.5 text-sm font-medium text-[var(--text)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-50 sm:w-auto sm:min-w-[130px] sm:flex-1">Wait for all quotes</button>
        <button type="button" disabled={!selected || busy} onClick={() => declineMode ? decide('decline') : setDeclineMode(true)} className="w-full rounded-xl py-2.5 text-sm font-semibold text-red-600 ring-1 ring-red-500/50 transition hover:bg-red-500/10 disabled:opacity-40 dark:text-red-400 sm:w-auto sm:min-w-[130px] sm:flex-1">{busy && declineMode ? 'Declining…' : declineMode ? 'Confirm decline' : 'Decline selected quote'}</button>
        {declineMode
          ? <button type="button" disabled={busy} onClick={() => setDeclineMode(false)} className="w-full rounded-xl py-2.5 text-sm font-semibold text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-50 sm:w-auto sm:min-w-[130px] sm:flex-1">Cancel decline</button>
          : <button type="button" disabled={!selected || busy} onClick={() => decide('approve')} className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40 sm:w-auto sm:min-w-[130px] sm:flex-1">{busy ? 'Approving…' : 'Approve selected quote'}</button>}
      </div>
    </>
  )
}

// Today-queue "Approve quote" pop-up: fetches the ticket's quote-panel rows on
// open (they're not in the queue payload) and shows the QuoteComparison — compare,
// select and approve/decline in place, no navigating into the ticket.
export function QuoteReviewButton({ ticketId, trigger }: { ticketId: string; trigger: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ rows: QuotePanelRow[]; canReQuote: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) return
    let live = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets fetch state when the pop-up opens, before the async load; cannot run during render
    setLoading(true); setErr('')
    fetch(`/api/tickets/${ticketId}/quotes`)
      .then(r => r.json())
      .then(d => { if (!live) return; if (d?.error) setErr(d.error); else setData(d) })
      .catch(() => { if (live) setErr('Could not load the quotes.') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [open, ticketId])
  return (
    <>
      {trigger(() => setOpen(true))}
      {open && (
        <Modal title="Review supplier quotes" maxWidth="max-w-5xl" onClose={() => setOpen(false)}>
          {loading ? <p className="py-4 text-center text-sm text-[var(--text-faint)]">Loading…</p>
            : err ? <p className="text-sm text-red-500">{err}</p>
            : data ? (data.rows.length ? <QuoteComparison ticketId={ticketId} rows={data.rows} onClose={() => setOpen(false)} /> : <p className="text-sm text-[var(--text-faint)]">No quotes yet.</p>)
            : null}
        </Modal>
      )}
    </>
  )
}

// ── Ask a declined supplier to submit a revised quote ───────────
export function ReQuoteButton({ ticketId, quoteId }: { ticketId: string; quoteId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  async function go() {
    setBusy(true); setErr('')
    try {
      await post(`/api/tickets/${ticketId}/quote-decision`, { action: 'requote', quoteId })
      setBusy(false); setSent(true)
      setTimeout(() => setSent(false), 4000)   // clear the confirmation after a moment
      router.refresh()
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  return (
    <div>
      <button onClick={go} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition disabled:opacity-50">{busy ? 'Sending…' : 'Ask to re-quote'}</button>
      {sent && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Re-quote request sent to the supplier.</p>}
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  )
}
