'use client'

// RM ticket-page custom actions for the competitive-quoting model.
import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Pencil, CalendarClock, Plus, ImagePlus, X, FileText } from 'lucide-react'
import { StarInput, Stars } from '@/components/ui/Stars'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { uploadFiles } from '@/lib/upload'
import { formatCurrency, formatDateTime } from '@/lib/utils'

async function post(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Something went wrong')
}

/** Field heading above an input/select/textarea. */
function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{label}</label>
      {children}
    </div>
  )
}

function Modal({ title, onClose, children, maxWidth = 'max-w-md' }: { title: string; onClose: () => void; children: React.ReactNode; maxWidth?: string }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className={`bg-[var(--surface-2)] ring-1 ring-[var(--border)] rounded-2xl p-5 ${maxWidth} w-full space-y-3 max-h-[85vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <p className="font-semibold text-[var(--text)]">{title}</p>
        {children}
      </div>
    </div>
  )
}

// ── Assign suppliers (button → modal with search + multi-select) ─
type SupplierChoice = { id: string; name: string; avgRating?: number; ratingCount?: number }
export function AssignSuppliersButton({ ticketId, suppliers, motivSuppliers = [], declinedSupplierIds = [], awaitingById = {}, trigger }: { ticketId: string; suppliers: SupplierChoice[]; motivSuppliers?: SupplierChoice[]; declinedSupplierIds?: string[]; awaitingById?: Record<string, 'invited' | 'quoted'>; trigger?: (open: () => void) => ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  // Auto-open when deep-linked from the Today queue's "Assign supplier" action
  // (?assign=1) — the new-ticket next step opens straight into the picker.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only deep-link (?assign=1) read from window.location after mount; cannot run during SSR render
    if (new URLSearchParams(window.location.search).get('assign') === '1') setOpen(true)
  }, [])
  const [tab, setTab] = useState<'mine' | 'motiv'>('mine')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmReinvite, setConfirmReinvite] = useState(false)
  const declinedSet = useMemo(() => new Set(declinedSupplierIds), [declinedSupplierIds])
  const nameById = useMemo(() => new Map([...suppliers, ...motivSuppliers].map(s => [s.id, s.name])), [suppliers, motivSuppliers])
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); setConfirmReinvite(false); return n })

  // Selection spans both lists; the tab just switches which directory is shown.
  const activeList = tab === 'motiv' ? motivSuppliers : suppliers
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return [...activeList]
      .filter(s => !term || s.name.toLowerCase().includes(term))
      .sort((a, b) => (sel.has(b.id) ? 1 : 0) - (sel.has(a.id) ? 1 : 0) || a.name.localeCompare(b.name))
  }, [activeList, q, sel])
  const reselected = useMemo(() => [...sel].filter(id => declinedSet.has(id)), [sel, declinedSet])

  async function doAssign() {
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/assign`, { supplierIds: [...sel] }); setOpen(false); setBusy(false); setConfirmReinvite(false); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }
  function assign() {
    if (!sel.size) { setErr('Select at least one supplier.'); return }
    // A supplier that previously declined this ticket → warn before re-sending.
    if (reselected.length && !confirmReinvite) { setConfirmReinvite(true); setErr(''); return }
    doAssign()
  }

  const tabCls = (on: boolean) => `flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${on ? 'bg-emerald-600 text-white' : 'ring-1 ring-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]'}`
  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (
        <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition">Assign supplier</button>
      )}
      {open && (
        <Modal title="Assign suppliers" maxWidth="max-w-2xl" onClose={() => setOpen(false)}>
          <p className="text-xs text-[var(--text-muted)]">Search and select one or more suppliers to invite to quote — from your own list or the Motiv directory.</p>
          {/* Switch directories; the selection carries across both. */}
          <div className="flex gap-2">
            <button onClick={() => setTab('mine')} className={tabCls(tab === 'mine')}>My suppliers ({suppliers.length})</button>
            <button onClick={() => setTab('motiv')} className={tabCls(tab === 'motiv')}>Motiv suppliers ({motivSuppliers.length})</button>
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search suppliers…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)]" />
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {shown.map(s => {
              // Already invited / already quoted on this ticket → not selectable
              // (re-inviting them is a no-op); show what we're waiting on instead.
              const awaiting = awaitingById[s.id]
              if (awaiting) {
                return (
                  <div key={s.id} className="flex items-center gap-2 text-sm px-2 py-2 rounded-lg opacity-60 cursor-not-allowed">
                    <span className="w-4 h-4 shrink-0" aria-hidden />
                    <span className="truncate text-[var(--text-muted)] flex-1 min-w-0">{s.name}</span>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 bg-amber-500/15 rounded-full px-2 py-0.5">{awaiting === 'quoted' ? 'Quoted' : 'Awaiting quote'}</span>
                  </div>
                )
              }
              return (
                <label key={s.id} className={`flex items-center gap-2 text-sm px-2 py-2 rounded-lg cursor-pointer ${sel.has(s.id) ? 'bg-emerald-500/10' : 'hover:bg-[var(--hover)]'}`}>
                  <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} className="accent-emerald-600 w-4 h-4" />
                  <span className="truncate text-[var(--text)] flex-1 min-w-0">{s.name}{declinedSet.has(s.id) && <span className="ml-1.5 text-[10px] font-semibold text-red-500">· declined before</span>}</span>
                  <span className="shrink-0"><Stars value={s.avgRating ?? 5} count={s.ratingCount} size={12} /></span>
                </label>
              )
            })}
            {!shown.length && <p className="text-sm text-[var(--text-faint)] px-2 py-2">{tab === 'motiv' ? 'No Motiv suppliers available.' : 'No matching suppliers.'}</p>}
          </div>
          {confirmReinvite && (
            <div className="rounded-lg bg-amber-500/10 ring-1 ring-amber-500/40 p-3">
              <p className="text-sm text-[var(--text)]"><span className="font-semibold">{reselected.map(id => nameById.get(id) ?? 'Supplier').join(', ')}</span> declined the previous quote request for this ticket. Send it to them again?</p>
            </div>
          )}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={assign} className="flex-1 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Assigning…' : confirmReinvite ? 'Yes, send again' : `Assign${sel.size ? ` (${sel.size})` : ''}`}</button>
            <button onClick={() => { confirmReinvite ? setConfirmReinvite(false) : setOpen(false) }} className="flex-1 py-2 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">{confirmReinvite ? 'Back' : 'Cancel'}</button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Request more info (amber button → modal) ────────────────────
const INFO_REASONS = ['Need more detail', 'Photos unclear', 'Scope unclear', 'Access details needed', 'Other']

export function RequestInfoButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState('')
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!preset) { setErr('Choose a reason.'); return }
    const reason = preset === 'Other' ? other.trim() : preset
    if (!reason) { setErr('Tell the store what you need.'); return }
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'request_info', reason }); setPreset(''); setOther(''); setOpen(false); setBusy(false); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition">Request more info</button>
      {open && (
        <Modal title="Request more information" onClose={() => setOpen(false)}>
          <p className="text-xs text-[var(--text-muted)]">The store manager will see this message and can edit + resubmit the ticket.</p>
          <select autoFocus className={input} value={preset} onChange={e => setPreset(e.target.value)}>
            <option value="">— Choose a reason —</option>
            {INFO_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {preset === 'Other' && <textarea className={`${input} min-h-[80px]`} placeholder="What do you need from the store?" value={other} onChange={e => setOther(e.target.value)} />}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={submit} className="flex-1 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Sending…' : 'Send request'}</button>
            <button onClick={() => setOpen(false)} className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold">Cancel</button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Request more evidence (amber button → modal) ────────────────
// Sends the COC/POC back asking for missing evidence, then the supplier resubmits.
// "Before photos missing" is intentionally NOT a reason here.
const EVIDENCE_REASONS = ['After photos missing', 'COC missing', 'Photos unclear', 'Work not fully shown', 'Other']

export function RequestEvidenceButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState('')
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!preset) { setErr('Choose what evidence is needed.'); return }
    const reason = preset === 'Other' ? other.trim() : preset
    if (!reason) { setErr('Tell the supplier what evidence you need.'); return }
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'request_evidence', reason }); setPreset(''); setOther(''); setOpen(false); setBusy(false); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-[#0a0e17] text-sm font-semibold transition">Request more evidence</button>
      {open && (
        <Modal title="Request more evidence" onClose={() => setOpen(false)}>
          <p className="text-xs text-[var(--text-muted)]">The supplier is asked to add the missing evidence and resubmit the COC &amp; POC.</p>
          <select autoFocus className={input} value={preset} onChange={e => setPreset(e.target.value)}>
            <option value="">— Choose what&apos;s needed —</option>
            {EVIDENCE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {preset === 'Other' && <textarea className={`${input} min-h-[80px]`} placeholder="What evidence do you need?" value={other} onChange={e => setOther(e.target.value)} />}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={submit} className="flex-1 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Sending…' : 'Send request'}</button>
            <button onClick={() => setOpen(false)} className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold">Cancel</button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Raise snag (red button → modal, mirrors Request more info) ───
const SNAG_REASONS = ['Work incomplete', 'Quality below standard', 'Wrong materials or spec', 'Safety concern', 'Other']

export function RaiseSnagButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState('')
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!preset) { setErr('Choose the snag reason.'); return }
    const description = preset === 'Other' ? other.trim() : preset
    if (!description) { setErr('Describe the snag.'); return }
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'raise_snag', description }); setPreset(''); setOther(''); setOpen(false); setBusy(false); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition">Raise snag</button>
      {open && (
        <Modal title="Raise a snag" onClose={() => setOpen(false)}>
          <p className="text-xs text-[var(--text-muted)]">The completion is sent back. The supplier accepts the snag, schedules the corrective work and resubmits.</p>
          <select autoFocus className={input} value={preset} onChange={e => setPreset(e.target.value)}>
            <option value="">— Choose a reason —</option>
            {SNAG_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {preset === 'Other' && <textarea className={`${input} min-h-[80px]`} placeholder="Describe the snag…" value={other} onChange={e => setOther(e.target.value)} />}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={submit} className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Raising…' : 'Raise snag'}</button>
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
      setBusy(false); setOpen(false); router.refresh()   // reset busy so a second edit isn't stuck on "Saving…"
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"><Pencil size={13} /> Edit ticket</button>
      {open && (
        <Modal title="Edit ticket" onClose={() => setOpen(false)}>
          <Labeled label="Title"><input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" /></Labeled>
          <div className="grid grid-cols-2 gap-2">
            <Labeled label="Category"><select className={input} value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></Labeled>
            <Labeled label="Priority"><select className={input} value={priority} onChange={e => setPriority(e.target.value)}>{PRIORITIES.map(p => <option key={p.v} value={p.v}>{p.label}</option>)}</select></Labeled>
          </div>
          <Labeled label="Operational Impact"><select className={input} value={impact} onChange={e => setImpact(e.target.value)}>{IMPACTS.map(i => <option key={i.v} value={i.v}>{i.label}</option>)}</select></Labeled>
          <Labeled label="Description"><textarea className={`${input} min-h-[90px]`} value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" /></Labeled>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={save} className="flex-1 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setOpen(false)} className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold">Cancel</button>
          </div>
        </Modal>
      )}
    </>
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
export function SupplierStatusList({ rows }: { rows: { name: string; status: string; invitedAt?: string | null; declineReason?: string | null }[] }) {
  if (!rows.length) return null
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        // A still-invited supplier that carries a decline reason was soft-declined
        // and asked to re-quote → "Awaiting updated quote" rather than "Waiting".
        const m = (r.status === 'invited' && r.declineReason)
          ? { dot: 'bg-amber-500', label: 'Awaiting updated quote', txt: 'text-amber-700 dark:text-amber-400' }
          : (TS_META[r.status] ?? TS_META.invited)
        return (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm text-[var(--text)] min-w-0">
                <i className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.dot}`} />
                <span className="truncate">{r.name}</span>
                {r.invitedAt && <span className="text-[11px] text-[var(--text-faint)] shrink-0 hidden sm:inline">· requested {formatDateTime(r.invitedAt)}</span>}
              </span>
              <span className={`text-[11px] font-semibold shrink-0 ${m.txt}`}>{m.label}</span>
            </div>
            {r.status === 'declined' && r.declineReason && (
              <div className="ml-[18px] rounded-lg bg-red-500/10 ring-1 ring-red-500/30 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Reason for declining</p>
                <p className="text-sm text-[var(--text)]">{r.declineReason}</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Quote review (approve / decline with reason) ────────────────
export interface ReviewQuote { id: string; supplierName: string; amount: number; amountInclVat: number | null; description: string | null; fileUrl: string | null; createdAt: string; proposedScheduleAt?: string | null }
const DECLINE_REASONS = ['Price too high', 'Scope unclear / incomplete', 'Choosing another supplier', 'Lead time too long', 'Other']

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
          <p className="text-[11px] text-[var(--text-faint)]">Received {formatDateTime(q.createdAt)}{q.amountInclVat ? ` · incl VAT ${formatCurrency(q.amountInclVat)}` : ''}</p>
          {q.proposedScheduleAt && (
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/30 px-2.5 py-1 text-[13px]">
              <CalendarClock size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="text-[var(--text-muted)]">Proposed visit</span>
              <span className="font-semibold text-[var(--text)]">{formatDateTime(q.proposedScheduleAt)}</span>
            </div>
          )}
          {q.description && <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{q.description}</p>}
          {q.fileUrl && <ViewTrackedLink ticketId={ticketId} itemType="quote" itemLabel={`${q.supplierName}'s quote`} href={q.fileUrl} className="text-sm text-[#C6A35D] underline">View attachment</ViewTrackedLink>}

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

const PANEL_META: Record<QuotePanelRow['kind'], { dot: string; label: string; txt: string }> = {
  waiting: { dot: 'bg-amber-500', label: 'Waiting for quote', txt: 'text-amber-700 dark:text-amber-400' },
  received: { dot: 'bg-emerald-500', label: 'Quote received', txt: 'text-emerald-600 dark:text-emerald-400' },
  accepted: { dot: 'bg-emerald-500', label: 'Accepted', txt: 'text-emerald-600 dark:text-emerald-400' },
  declined: { dot: 'bg-red-500', label: 'Declined', txt: 'text-red-600 dark:text-red-400' },
}

export function RmQuotePanel({ ticketId, rows, canReQuote }: { ticketId: string; rows: QuotePanelRow[]; canReQuote: boolean }) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)      // supplierId whose quote pop-up is open
  const [mode, setMode] = useState<'view' | 'approve' | 'decline'>('view')
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState(DECLINE_REASONS[0])
  const [other, setOther] = useState('')
  const [err, setErr] = useState('')
  const active = rows.find(r => r.supplierId === openId) ?? null

  function openModal(id: string, m: 'view' | 'approve' | 'decline' = 'view') { setOpenId(id); setMode(m); setReason(DECLINE_REASONS[0]); setOther(''); setErr('') }
  async function decide(quoteId: string, action: 'approve' | 'decline') {
    setBusy(true); setErr('')
    const declineReason = action === 'decline' ? (reason === 'Other' ? (other.trim() || 'Other') : reason) : undefined
    try { await post(`/api/tickets/${ticketId}/quote-decision`, { action, quoteId, reason: declineReason }); setBusy(false); setOpenId(null); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }
  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'

  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Suppliers &amp; quotes</p>
      {/* Bare stacked rows (no box) — suppliers listed under each other, split by a
          thin divider, to take as little space as possible. */}
      <div className="divide-y divide-[var(--border)]">
        {rows.map(r => {
          const m = PANEL_META[r.kind]
          return (
            <div key={r.supplierId} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <i className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.dot}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-[var(--text)]">{r.name}</span>
                    {r.requestedAt && <span className="text-[11px] text-[var(--text-faint)]">requested {formatDateTime(r.requestedAt)}</span>}
                  </span>
                </span>
                {r.quote ? (
                  <button type="button" onClick={() => openModal(r.supplierId)} className={`flex items-center gap-1.5 shrink-0 text-[11px] font-semibold ${m.txt} hover:underline`}>
                    {m.label} · {formatCurrency(r.quote.amount)} <FileText size={13} />
                  </button>
                ) : (
                  <span className={`text-[11px] font-semibold shrink-0 ${m.txt}`}>{m.label}</span>
                )}
              </div>
              {r.kind === 'received' && (
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => openModal(r.supplierId, 'approve')} className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition">Approve</button>
                  <button type="button" onClick={() => openModal(r.supplierId, 'decline')} className="flex-1 py-1.5 rounded-lg ring-1 ring-red-500/40 text-red-600 dark:text-red-400 text-xs font-semibold transition hover:bg-red-500/10">Decline</button>
                </div>
              )}
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

      {active?.quote && (
        <Modal title={`${active.name}'s quote`} maxWidth="max-w-2xl" onClose={() => setOpenId(null)}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[var(--text)] truncate">{active.name}</span>
            <span className="text-lg font-bold text-[var(--text)] shrink-0">{formatCurrency(active.quote.amount)}</span>
          </div>
          <p className="text-[11px] text-[var(--text-faint)]">Received {formatDateTime(active.quote.createdAt)}{active.quote.amountInclVat ? ` · incl VAT ${formatCurrency(active.quote.amountInclVat)}` : ''}</p>
          {active.quote.proposedScheduleAt && (
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/30 px-2.5 py-1 text-[13px]">
              <CalendarClock size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="text-[var(--text-muted)]">Proposed visit</span>
              <span className="font-semibold text-[var(--text)]">{formatDateTime(active.quote.proposedScheduleAt)}</span>
            </div>
          )}
          {active.quote.description && <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{active.quote.description}</p>}
          {active.quote.fileUrl && <ViewTrackedLink ticketId={ticketId} itemType="quote" itemLabel={`${active.name}'s quote`} href={active.quote.fileUrl} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"><FileText size={14} /> View attachment</ViewTrackedLink>}

          {active.kind === 'received' && (
            mode === 'decline' ? (
              <div className="space-y-2 pt-1">
                <select className={input} value={reason} onChange={e => setReason(e.target.value)}>{DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>
                {reason === 'Other' && <textarea className={`${input} min-h-[60px]`} placeholder="Reason…" value={other} onChange={e => setOther(e.target.value)} />}
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

// ── Generic review panel (COC/POC · snag · VO) — mirrors the quote panel ─────
// A compact clickable summary row in the "Next action" block that pops up the
// full detail + the action buttons (composed on the server and passed in as
// `body`). Same look as RmQuotePanel so every pending decision reads the same.
export function RmReviewPanel({ heading, items }: {
  heading?: string
  items: { id: string; dot: string; title: string; subtitle?: string | null; statusLabel: string; statusCls: string; modalTitle?: string; body: ReactNode }[]
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const active = items.find(i => i.id === openId) ?? null
  if (!items.length) return null
  return (
    <div className="space-y-2">
      {heading && <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{heading}</p>}
      <div className="divide-y divide-[var(--border)]">
        {items.map(it => (
          <button key={it.id} type="button" onClick={() => setOpenId(it.id)} className="w-full py-2 flex items-center justify-between gap-2 text-left transition hover:bg-[var(--hover)]">
            <span className="flex items-center gap-2 min-w-0">
              <i className={`w-2.5 h-2.5 rounded-full shrink-0 ${it.dot}`} />
              <span className="min-w-0">
                <span className="block truncate text-sm text-[var(--text)]">{it.title}</span>
                {it.subtitle && <span className="text-[11px] text-[var(--text-faint)]">{it.subtitle}</span>}
              </span>
            </span>
            <span className={`flex items-center gap-1.5 shrink-0 text-[11px] font-semibold ${it.statusCls}`}>{it.statusLabel} <FileText size={13} /></span>
          </button>
        ))}
      </div>
      {active && (
        <Modal title={active.modalTitle ?? active.title} maxWidth="max-w-2xl" onClose={() => setOpenId(null)}>
          {active.body}
        </Modal>
      )}
    </div>
  )
}

// Today-queue "Approve quote" pop-up: fetches the ticket's quote-panel rows on
// open (they're not in the queue payload) and shows the same RmQuotePanel — view
// each quote + Approve / Decline in place, no navigating into the ticket.
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
        <Modal title="Review quotes" maxWidth="max-w-2xl" onClose={() => setOpen(false)}>
          {loading ? <p className="py-4 text-center text-sm text-[var(--text-faint)]">Loading…</p>
            : err ? <p className="text-sm text-red-500">{err}</p>
            : data ? (data.rows.length ? <RmQuotePanel ticketId={ticketId} rows={data.rows} canReQuote={data.canReQuote} /> : <p className="text-sm text-[var(--text-faint)]">No quotes yet.</p>)
            : null}
        </Modal>
      )}
    </>
  )
}

// ── RM adds extra work to the ticket (before a supplier is assigned) ─
export function RmAddWorkForm({ ticketId, description, photoUrls, title, category, impact }: {
  ticketId: string; description: string; photoUrls: string[]; title: string; category: string; impact: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)]'

  async function submit() {
    if (!text.trim()) { setErr('Describe the extra work.'); return }
    setBusy(true); setErr('')
    try {
      const { urls: newUrls } = await uploadFiles(files.filter(f => f.type.startsWith('image/')), 'ticket-photos')
      const newDescription = `${description}\n\n— Extra Work: ${text.trim()}`
      // The ticket endpoint is PATCH-only — POSTing here was the "something went wrong".
      const res = await fetch(`/api/tickets/${ticketId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description: newDescription, category, operational_impact: impact, photo_urls: [...photoUrls, ...newUrls], edit_note: 'added extra work' }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to add the extra work.')
      setBusy(false); setOpen(false); setText(''); setFiles([]); router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition">
        <Plus size={16} /> Add extra work
      </button>
      {open && (
        <Modal title="Add extra work to this ticket" maxWidth="max-w-2xl" onClose={() => { if (!busy) { setOpen(false); setErr('') } }}>
          <p className="text-xs text-[var(--text-muted)]">Extra scope you know of — added to the ticket brief before a supplier is assigned.</p>
          <textarea autoFocus className={`${input} min-h-[160px]`} placeholder="Describe the extra work needed…" value={text} onChange={e => { setText(e.target.value); setErr('') }} />
          <label className="flex items-center justify-center gap-2 py-2.5 rounded-lg ring-1 ring-[var(--border)] text-sm text-[var(--text)] transition cursor-pointer hover:border-[#C6A35D] hover:bg-[var(--hover)]">
            <ImagePlus size={15} /> Add photos <span className="text-[var(--text-faint)]">(optional)</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => setFiles(p => [...p, ...Array.from(e.target.files ?? [])].slice(0, 5))} />
          </label>
          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)]">
                  <FileText size={14} className="text-[#C6A35D] shrink-0" /><span className="text-xs text-[var(--text)] truncate flex-1">{f.name}</span>
                  <button type="button" onClick={() => setFiles(p => p.filter((_, j) => j !== i))} className="p-0.5 text-[var(--text-faint)] hover:text-red-500"><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={busy} className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Adding…' : 'Add to ticket'}</button>
            <button onClick={() => { setOpen(false); setErr('') }} disabled={busy} className="flex-1 py-2 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Cancel</button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Variation order review (approve / decline) ──────────────────
const VO_DECLINE_REASONS = ['Cost too high', 'Not budgeted', 'Outside agreed scope', 'Needs more detail / justification', 'Obtain another quote', 'Other']
export function VariationReviewCard({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmApprove, setConfirmApprove] = useState(false)   // approve confirm sits over the buttons
  const [declineOpen, setDeclineOpen] = useState(false)         // decline is a pop-up
  const [reason, setReason] = useState('')
  const [other, setOther] = useState('')
  const [err, setErr] = useState('')
  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'

  async function act(action: 'approve_variation' | 'reject_variation', reasonText?: string) {
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action, reason: reasonText }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }
  function submitDecline() {
    if (!reason) { setErr('Choose a reason.'); return }
    const r = reason === 'Other' ? other.trim() : reason
    if (!r) { setErr('Enter a reason.'); return }
    act('reject_variation', r)
  }

  return (
    <div className="space-y-2">
      {confirmApprove ? (
        // "Are you sure?" replaces the buttons in place (no separate row).
        <div className="rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] p-3 space-y-2">
          <p className="text-sm text-[var(--text)]">Are you sure you want to approve the variation order?</p>
          <div className="flex gap-2">
            <button onClick={() => act('approve_variation')} disabled={busy} className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Approving…' : 'Yes, approve'}</button>
            <button onClick={() => setConfirmApprove(false)} disabled={busy} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => { setErr(''); setConfirmApprove(true) }} className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition">Approve variation order</button>
          <button onClick={() => { setReason(''); setOther(''); setErr(''); setDeclineOpen(true) }} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition">Decline variation order</button>
        </div>
      )}
      {err && !declineOpen && <p className="text-xs text-red-500">{err}</p>}

      {declineOpen && (
        <Modal title="Decline variation order" onClose={() => { if (!busy) { setDeclineOpen(false); setErr('') } }}>
          <p className="text-xs text-[var(--text-muted)]">The supplier is notified. Choose why the variation order is declined.</p>
          <select autoFocus className={input} value={reason} onChange={e => { setReason(e.target.value); setErr('') }}>
            <option value="">— Choose a reason —</option>
            {VO_DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {reason === 'Other' && <textarea className={`${input} min-h-[80px]`} placeholder="Reason…" value={other} onChange={e => setOther(e.target.value)} />}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={submitDecline} disabled={busy} className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Declining…' : 'Decline variation order'}</button>
            <button onClick={() => { setDeclineOpen(false); setErr('') }} disabled={busy} className="flex-1 py-2 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Approve sign-off (rate the supplier first) ──────────────────
export function ApproveSignoffCard({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function approve() {
    if (!score) { setErr('Please give the supplier a star rating before accepting.'); return }
    setBusy(true); setErr('')
    try {
      await post(`/api/ratings`, { ticketId, score, comment })
      await post(`/api/tickets/${ticketId}/transition`, { action: 'approve' })
      router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="rounded-xl ring-1 ring-[var(--border)] p-4 space-y-3">
      <p className="text-sm font-semibold text-[var(--text)]">Rate the supplier, then accept the COC &amp; POC</p>
      <StarInput value={score} onChange={setScore} />
      <textarea className="w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm min-h-[60px]" placeholder="Comment on the supplier's work (optional)" value={comment} onChange={e => setComment(e.target.value)} />
      {err && <p className="text-xs text-red-500">{err}</p>}
      <button onClick={approve} disabled={busy} className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Submitting…' : 'Accept COC/POC'}</button>
    </div>
  )
}

// ── Accept a supplier's proposed (beyond-window) visit time ─────
export function AcceptScheduleCard({ ticketId, scheduledAt }: { ticketId: string; scheduledAt: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function accept() {
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'accept_schedule' }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <div className="rounded-xl ring-1 ring-indigo-500/40 bg-indigo-500/5 p-4 space-y-2">
      <p className="text-sm font-semibold text-[var(--text)]">Proposed visit time</p>
      <p className="text-sm text-[var(--text-muted)]">The supplier proposed <span className="font-semibold text-[var(--text)]">{formatDateTime(scheduledAt)}</span>, which is past the SLA window. Accept it so meeting it won&apos;t count as a breach, or leave it for the supplier to re-schedule.</p>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <button onClick={accept} disabled={busy} className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Accepting…' : 'Accept proposed time'}</button>
    </div>
  )
}

// ── Approve / decline a supplier's proposed snag-fix date ───────
const SNAG_SCHEDULE_DECLINE_REASONS = ['Date is too far out', 'Needs to be done sooner', 'Outside acceptable window', 'Clashes with store operations', 'Other']
export function AcceptSnagScheduleCard({ ticketId, scheduledAt }: { ticketId: string; scheduledAt: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [declineOpen, setDeclineOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [other, setOther] = useState('')
  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'

  async function approve() {
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'approve_snag' }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }
  async function decline() {
    if (!reason) { setErr('Choose a reason.'); return }
    const finalReason = reason === 'Other' ? other.trim() : reason
    if (!finalReason) { setErr('Tell the supplier why.'); return }
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'decline_snag_schedule', reason: finalReason }); setDeclineOpen(false); setBusy(false); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="rounded-xl ring-1 ring-indigo-500/40 bg-indigo-500/5 p-4 space-y-2">
      <p className="text-sm font-semibold text-[var(--text)]">Snag fix schedule</p>
      <p className="text-sm text-[var(--text-muted)]">The supplier proposed <span className="font-semibold text-[var(--text)]">{formatDateTime(scheduledAt)}</span> to carry out the corrective work. Approve to confirm, or decline to ask for a new date.</p>
      {err && !declineOpen && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button onClick={approve} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Approving…' : 'Approve snag schedule'}</button>
        <button onClick={() => { setReason(''); setOther(''); setErr(''); setDeclineOpen(true) }} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50">Decline</button>
      </div>
      {declineOpen && (
        <Modal title="Decline snag schedule" onClose={() => { if (!busy) { setDeclineOpen(false); setErr('') } }}>
          <p className="text-xs text-[var(--text-muted)]">The supplier is notified and asked to propose a new date for the corrective work.</p>
          <select autoFocus className={input} value={reason} onChange={e => { setReason(e.target.value); setErr('') }}>
            <option value="">— Choose a reason —</option>
            {SNAG_SCHEDULE_DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {reason === 'Other' && <textarea className={`${input} min-h-[80px]`} placeholder="Tell the supplier why…" value={other} onChange={e => setOther(e.target.value)} />}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={decline} disabled={busy} className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Declining…' : 'Decline schedule'}</button>
            <button onClick={() => { setDeclineOpen(false); setErr('') }} disabled={busy} className="flex-1 py-2 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Cancel</button>
          </div>
        </Modal>
      )}
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
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'reject', reason: finalReason }); setOpen(false); setBusy(false); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition">Cancel ticket</button>
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

// ── Final close-out — greyed until the supplier confirms no more VOs ─
export function CloseOutButton({ ticketId, voConfirmed }: { ticketId: string; voConfirmed: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function closeOut() {
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'close_out' }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <div className="space-y-1.5">
      {!voConfirmed && <p className="text-xs text-[var(--text-muted)]">Waiting for the supplier to confirm there are no further variation orders before you can close out.</p>}
      <button onClick={closeOut} disabled={busy || !voConfirmed} className="w-full py-2.5 rounded-xl bg-[#C6A35D] hover:brightness-95 text-[#0a0e17] text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed">{busy ? 'Closing out…' : 'Final close-out'}</button>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
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
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <div>
      <button onClick={go} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition disabled:opacity-50">{busy ? 'Sending…' : 'Ask to re-quote'}</button>
      {sent && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Re-quote request sent to the supplier.</p>}
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  )
}
