'use client'

// RM ticket-page custom actions for the competitive-quoting model.
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Pencil } from 'lucide-react'
import { formatCurrency, formatDateTime } from '@/lib/utils'

async function post(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Something went wrong')
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[var(--surface-2)] ring-1 ring-[var(--border)] rounded-2xl p-5 max-w-md w-full space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <p className="font-semibold text-[var(--text)]">{title}</p>
        {children}
      </div>
    </div>
  )
}

// ── Assign suppliers (button → modal with search + multi-select) ─
export function AssignSuppliersButton({ ticketId, suppliers }: { ticketId: string; suppliers: { id: string; name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Selected float to the top; then alphabetical; filtered by the search box.
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return [...suppliers]
      .filter(s => !term || s.name.toLowerCase().includes(term))
      .sort((a, b) => (sel.has(b.id) ? 1 : 0) - (sel.has(a.id) ? 1 : 0) || a.name.localeCompare(b.name))
  }, [suppliers, q, sel])

  async function assign() {
    if (!sel.size) { setErr('Select at least one supplier.'); return }
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/assign`, { supplierIds: [...sel] }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition">Assign supplier</button>
      {open && (
        <Modal title="Assign suppliers" onClose={() => setOpen(false)}>
          <p className="text-xs text-[var(--text-muted)]">Search and select one or more suppliers to invite to quote.</p>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search suppliers…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)]" />
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {shown.map(s => (
              <label key={s.id} className={`flex items-center gap-2 text-sm px-2 py-2 rounded-lg cursor-pointer ${sel.has(s.id) ? 'bg-[#C6A35D]/10' : 'hover:bg-[var(--hover)]'}`}>
                <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} className="accent-[#C6A35D] w-4 h-4" />
                <span className="truncate text-[var(--text)]">{s.name}</span>
              </label>
            ))}
            {!shown.length && <p className="text-sm text-[var(--text-faint)] px-2 py-2">No matching suppliers.</p>}
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={assign} className="flex-1 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Assigning…' : `Assign${sel.size ? ` (${sel.size})` : ''}`}</button>
            <button onClick={() => setOpen(false)} className="flex-1 py-2 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Request more info (amber button → modal) ────────────────────
export function RequestInfoButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!reason.trim()) { setErr('Tell the store what you need.'); return }
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'request_info', reason: reason.trim() }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-[#0a0e17] text-sm font-semibold transition">Request more info</button>
      {open && (
        <Modal title="Request more information" onClose={() => setOpen(false)}>
          <p className="text-xs text-[var(--text-muted)]">The store manager will see this message and can edit + resubmit the ticket.</p>
          <textarea autoFocus className={`${input} min-h-[90px]`} placeholder="What do you need from the store?" value={reason} onChange={e => setReason(e.target.value)} />
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={submit} className="flex-1 py-2 rounded-xl bg-amber-500 text-[#0a0e17] text-sm font-semibold disabled:opacity-50">{busy ? 'Sending…' : 'Send request'}</button>
            <button onClick={() => setOpen(false)} className="flex-1 py-2 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── RM edit ticket (before a supplier is assigned) ──────────────
const CATEGORIES = ['Electrical', 'Plumbing', 'HVAC', 'Refrigeration', 'Gas', 'Structural', 'General', 'Cleaning', 'Other']
const IMPACTS = [
  { v: 'none', label: 'No operational impact' }, { v: 'cosmetic', label: 'Cosmetic / minor' },
  { v: 'customer_visible', label: 'Customer-visible' }, { v: 'staff_inconvenience', label: 'Staff inconvenience' },
  { v: 'trading_affected', label: 'Trading affected' }, { v: 'safety_risk', label: 'Safety risk' }, { v: 'cannot_trade', label: 'Store cannot trade' },
]
const PRIORITIES = [{ v: 'P1', label: 'Urgent' }, { v: 'P2', label: 'High' }, { v: 'P3', label: 'Medium' }, { v: 'P4', label: 'Low' }]

export function RmEditTicketForm({ ticketId, initial }: { ticketId: string; initial: { title: string; category: string; impact: string; priority: string; description: string } }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [title, setTitle] = useState(initial.title)
  const [category, setCategory] = useState(initial.category || 'General')
  const [impact, setImpact] = useState(initial.impact || 'none')
  const [priority, setPriority] = useState(initial.priority || 'P3')
  const [description, setDescription] = useState(initial.description)
  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'

  async function save() {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description, category, operational_impact: impact, priority }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to save')
      setOpen(false); router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  if (!open) return <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C6A35D] hover:underline"><Pencil size={13} /> Edit ticket</button>

  return (
    <div className="rounded-xl ring-1 ring-[var(--border)] p-4 space-y-2">
      <input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" />
      <div className="grid grid-cols-2 gap-2">
        <select className={input} value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <select className={input} value={priority} onChange={e => setPriority(e.target.value)}>{PRIORITIES.map(p => <option key={p.v} value={p.v}>{p.label}</option>)}</select>
      </div>
      <select className={input} value={impact} onChange={e => setImpact(e.target.value)}>{IMPACTS.map(i => <option key={i.v} value={i.v}>{i.label}</option>)}</select>
      <textarea className={`${input} min-h-[90px]`} value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" />
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={save} className="px-3 py-2 rounded-lg bg-[#C6A35D] text-[#0a0e17] text-sm font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        <button onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
      </div>
    </div>
  )
}

// ── Per-supplier status indicators (with request-sent time) ─────
const TS_META: Record<string, { dot: string; label: string; txt: string }> = {
  invited:  { dot: 'bg-amber-500',   label: 'Waiting for quote', txt: 'text-amber-700 dark:text-amber-400' },
  quoted:   { dot: 'bg-emerald-500', label: 'Quote received',    txt: 'text-emerald-700 dark:text-emerald-400' },
  awarded:  { dot: 'bg-emerald-600', label: 'Awarded',           txt: 'text-emerald-700 dark:text-emerald-400' },
  declined: { dot: 'bg-red-500',     label: 'Declined',          txt: 'text-red-600 dark:text-red-400' },
  closed:   { dot: 'bg-gray-400',    label: 'Closed',            txt: 'text-[var(--text-faint)]' },
}
export function SupplierStatusList({ rows }: { rows: { name: string; status: string; invitedAt?: string | null }[] }) {
  if (!rows.length) return null
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const m = TS_META[r.status] ?? TS_META.invited
        return (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm text-[var(--text)] min-w-0">
              <i className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.dot}`} />
              <span className="truncate">{r.name}</span>
              {r.invitedAt && <span className="text-[11px] text-[var(--text-faint)] shrink-0 hidden sm:inline">· requested {formatDateTime(r.invitedAt)}</span>}
            </span>
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
        <Modal title="Cancel this ticket?" onClose={() => setOpen(false)}>
          <p className="text-sm text-[var(--text-muted)]">Choose a reason — the store manager will be notified.</p>
          <select className={input} value={reason} onChange={e => setReason(e.target.value)}>{CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>
          {reason === 'Other' && <textarea className={`${input} min-h-[60px]`} placeholder="Reason…" value={other} onChange={e => setOther(e.target.value)} />}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={cancel} className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Cancelling…' : 'Confirm cancel'}</button>
            <button onClick={() => setOpen(false)} className="flex-1 py-2 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Keep ticket</button>
          </div>
        </Modal>
      )}
    </>
  )
}
