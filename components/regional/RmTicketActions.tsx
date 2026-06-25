'use client'

// RM ticket-page custom actions for the competitive-quoting model:
//  • AssignSuppliersCard  — invite one or more suppliers to quote.
//  • SupplierStatusList   — per-supplier indicator (waiting/quoted/declined/awarded).
//  • QuoteReviewCard      — review each quote; approve (award) or decline (reason).
//  • CancelTicketCard     — cancel the ticket with a reason.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDateTime } from '@/lib/utils'

async function post(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Something went wrong')
}

// ── Assign suppliers (multi-select) ─────────────────────────────
export function AssignSuppliersCard({ ticketId, suppliers }: { ticketId: string; suppliers: { id: string; name: string }[] }) {
  const router = useRouter()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function assign() {
    if (!sel.size) { setErr('Select at least one supplier.'); return }
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/assign`, { supplierIds: [...sel] }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)]">Select one or more suppliers to invite to quote.</p>
      <div className="space-y-1.5 max-h-60 overflow-y-auto">
        {suppliers.map(s => (
          <label key={s.id} className="flex items-center gap-2 text-sm text-[var(--text)] cursor-pointer">
            <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} className="accent-[#C6A35D] w-4 h-4" />
            <span className="truncate">{s.name}</span>
          </label>
        ))}
        {!suppliers.length && <p className="text-sm text-[var(--text-faint)]">No active suppliers to assign.</p>}
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <button onClick={assign} disabled={busy} className="px-3 py-2 rounded-xl bg-[#C6A35D] text-[#0a0e17] text-sm font-semibold disabled:opacity-50">
        {busy ? 'Assigning…' : `Assign supplier${sel.size > 1 ? 's' : ''}`}
      </button>
    </div>
  )
}

// ── Per-supplier status indicators ──────────────────────────────
const TS_META: Record<string, { dot: string; label: string; txt: string }> = {
  invited:  { dot: 'bg-amber-500',   label: 'Waiting for quote', txt: 'text-amber-700 dark:text-amber-400' },
  quoted:   { dot: 'bg-emerald-500', label: 'Quote received',    txt: 'text-emerald-700 dark:text-emerald-400' },
  awarded:  { dot: 'bg-emerald-600', label: 'Awarded',           txt: 'text-emerald-700 dark:text-emerald-400' },
  declined: { dot: 'bg-red-500',     label: 'Declined',          txt: 'text-red-600 dark:text-red-400' },
  closed:   { dot: 'bg-gray-400',    label: 'Closed',            txt: 'text-[var(--text-faint)]' },
}
export function SupplierStatusList({ rows }: { rows: { name: string; status: string }[] }) {
  if (!rows.length) return null
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const m = TS_META[r.status] ?? TS_META.invited
        return (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm text-[var(--text)] min-w-0"><i className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.dot}`} /><span className="truncate">{r.name}</span></span>
            <span className={`text-[11px] font-semibold shrink-0 ${m.txt}`}>{m.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Quote review (approve / decline with reason) ────────────────
export interface ReviewQuote { id: string; supplierName: string; amount: number; amountInclVat: number | null; description: string | null; fileUrl: string | null; createdAt: string }
const DECLINE_REASONS = ['Price too high', 'Scope unclear / incomplete', 'Choosing another supplier', 'Lead time too long', 'Other']

export function QuoteReviewCard({ ticketId, quotes }: { ticketId: string; quotes: ReviewQuote[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [declineFor, setDeclineFor] = useState<string | null>(null)
  const [reason, setReason] = useState(DECLINE_REASONS[0])
  const [other, setOther] = useState('')
  const [err, setErr] = useState('')
  if (!quotes.length) return <p className="text-sm text-[var(--text-faint)]">No quotes submitted yet.</p>

  async function decide(quoteId: string, action: 'approve' | 'decline') {
    setBusy(quoteId); setErr('')
    const declineReason = action === 'decline' ? (reason === 'Other' ? (other.trim() || 'Other') : reason) : undefined
    try { await post(`/api/tickets/${ticketId}/quote-decision`, { action, quoteId, reason: declineReason }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(null) }
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
          <p className="text-[11px] text-[var(--text-faint)]">Submitted {formatDateTime(q.createdAt)}{q.amountInclVat ? ` · incl VAT ${formatCurrency(q.amountInclVat)}` : ''}</p>
          {q.description && <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{q.description}</p>}
          {q.fileUrl && <a href={q.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C6A35D] underline">View attachment</a>}

          {declineFor === q.id ? (
            <div className="space-y-2 pt-1">
              <select className={input} value={reason} onChange={e => setReason(e.target.value)}>{DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>
              {reason === 'Other' && <textarea className={`${input} min-h-[60px]`} placeholder="Reason…" value={other} onChange={e => setOther(e.target.value)} />}
              <div className="flex gap-2">
                <button onClick={() => decide(q.id, 'decline')} disabled={busy === q.id} className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">Confirm decline</button>
                <button onClick={() => setDeclineFor(null)} className="px-3 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Back</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 pt-1">
              <button onClick={() => decide(q.id, 'approve')} disabled={busy === q.id} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">{busy === q.id ? '…' : 'Approve'}</button>
              <button onClick={() => { setDeclineFor(q.id); setReason(DECLINE_REASONS[0]); setOther('') }} className="px-3 py-2 rounded-lg ring-1 ring-red-500/40 text-red-600 dark:text-red-400 text-sm font-semibold">Decline</button>
            </div>
          )}
        </div>
      ))}
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  )
}

// ── Cancel ticket (with reason) ─────────────────────────────────
const CANCEL_REASONS = ['Duplicate ticket', 'Issue resolved itself', 'Not a maintenance issue', 'Store closed', 'Logged in error', 'Other']
export function CancelTicketCard({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(CANCEL_REASONS[0])
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function cancel() {
    setBusy(true); setErr('')
    const finalReason = reason === 'Other' ? (other.trim() || 'Other') : reason
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'reject', reason: finalReason }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'
  return (
    <>
      <button onClick={() => setOpen(true)} className="px-3 py-2 rounded-xl ring-1 ring-red-500/40 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-500/10 transition">Cancel ticket</button>
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-[var(--surface-2)] ring-1 ring-[var(--border)] rounded-2xl p-5 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-[var(--text)]">Cancel this ticket?</p>
            <p className="text-sm text-[var(--text-muted)]">Choose a reason — the store manager will be notified.</p>
            <select className={input} value={reason} onChange={e => setReason(e.target.value)}>{CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>
            {reason === 'Other' && <textarea className={`${input} min-h-[60px]`} placeholder="Reason…" value={other} onChange={e => setOther(e.target.value)} />}
            {err && <p className="text-xs text-red-500">{err}</p>}
            <div className="flex gap-2">
              <button disabled={busy} onClick={cancel} className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Cancelling…' : 'Confirm cancel'}</button>
              <button onClick={() => setOpen(false)} className="flex-1 py-2 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Keep ticket</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
