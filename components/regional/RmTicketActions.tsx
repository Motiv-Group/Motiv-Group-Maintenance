'use client'

// RM ticket-page custom actions for the competitive-quoting model.
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Pencil, CalendarClock, Plus, ImagePlus, X, FileText } from 'lucide-react'
import { StarInput, Stars } from '@/components/ui/Stars'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { createClient } from '@/lib/supabase/client'
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
type SupplierChoice = { id: string; name: string; avgRating?: number; ratingCount?: number }
export function AssignSuppliersButton({ ticketId, suppliers, motivSuppliers = [] }: { ticketId: string; suppliers: SupplierChoice[]; motivSuppliers?: SupplierChoice[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'mine' | 'motiv'>('mine')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Selection spans both lists; the tab just switches which directory is shown.
  const activeList = tab === 'motiv' ? motivSuppliers : suppliers
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return [...activeList]
      .filter(s => !term || s.name.toLowerCase().includes(term))
      .sort((a, b) => (sel.has(b.id) ? 1 : 0) - (sel.has(a.id) ? 1 : 0) || a.name.localeCompare(b.name))
  }, [activeList, q, sel])

  async function assign() {
    if (!sel.size) { setErr('Select at least one supplier.'); return }
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/assign`, { supplierIds: [...sel] }); setOpen(false); setBusy(false); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const tabCls = (on: boolean) => `flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${on ? 'bg-[#C6A35D] text-[#0a0e17]' : 'ring-1 ring-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]'}`
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition">Assign supplier</button>
      {open && (
        <Modal title="Assign suppliers" onClose={() => setOpen(false)}>
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
            {shown.map(s => (
              <label key={s.id} className={`flex items-center gap-2 text-sm px-2 py-2 rounded-lg cursor-pointer ${sel.has(s.id) ? 'bg-[#C6A35D]/10' : 'hover:bg-[var(--hover)]'}`}>
                <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} className="accent-[#C6A35D] w-4 h-4" />
                <span className="truncate text-[var(--text)] flex-1 min-w-0">{s.name}</span>
                <span className="shrink-0"><Stars value={s.avgRating ?? 5} count={s.ratingCount} size={12} /></span>
              </label>
            ))}
            {!shown.length && <p className="text-sm text-[var(--text-faint)] px-2 py-2">{tab === 'motiv' ? 'No Motiv suppliers available.' : 'No matching suppliers.'}</p>}
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
      <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-[#0a0e17] text-sm font-semibold transition">Request more info</button>
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
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C6A35D] hover:underline"><Pencil size={13} /> Edit ticket</button>
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
  const [sentMsg, setSentMsg] = useState('')
  if (!quotes.length) return <p className="text-sm text-[var(--text-faint)]">No quotes submitted yet.</p>

  async function decide(quoteId: string, action: 'approve' | 'decline') {
    setBusy(quoteId); setErr('')
    const declineReason = action === 'decline' ? (reason === 'Other' ? (other.trim() || 'Other') : reason) : undefined
    try {
      await post(`/api/tickets/${ticketId}/quote-decision`, { action, quoteId, reason: declineReason })
      // A soft decline (not "Choosing another supplier") asks the supplier to re-quote
      // — confirm the request was delivered, then refresh.
      if (action === 'decline' && declineReason !== 'Choosing another supplier') {
        setBusy(null); setDeclineFor(null)
        setSentMsg(`Re-quote request sent to ${quotes.find(x => x.id === quoteId)?.supplierName ?? 'the supplier'}.`)
        setTimeout(() => { setSentMsg(''); router.refresh() }, 1800)
      } else { router.refresh() }
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
      {sentMsg && <p className="text-xs text-emerald-600 dark:text-emerald-400">{sentMsg}</p>}
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
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
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const newUrls: string[] = []
      for (const f of files.filter(f => f.type.startsWith('image/'))) {
        const path = `${user?.id ?? 'rm'}/${ticketId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${f.name.replace(/[^\w.\-]/g, '_')}`
        const { error } = await supabase.storage.from('ticket-photos').upload(path, f, { upsert: true })
        if (!error) newUrls.push(supabase.storage.from('ticket-photos').getPublicUrl(path).data.publicUrl)
      }
      const newDescription = `${description}\n\n— Added by RM: ${text.trim()}`
      // The ticket endpoint is PATCH-only — POSTing here was the "something went wrong".
      const res = await fetch(`/api/tickets/${ticketId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description: newDescription, category, operational_impact: impact, photo_urls: [...photoUrls, ...newUrls] }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to add the extra work.')
      setBusy(false); setOpen(false); setText(''); setFiles([]); router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl ring-1 ring-[#C6A35D]/40 text-[#C6A35D] text-sm font-semibold hover:bg-[#C6A35D]/10 transition">
        <Plus size={16} /> Add extra work
      </button>
      {open && (
        <Modal title="Add extra work to this ticket" onClose={() => { if (!busy) { setOpen(false); setErr('') } }}>
          <p className="text-xs text-[var(--text-muted)]">Extra scope you know of — added to the ticket brief before a supplier is assigned.</p>
          <textarea autoFocus className={`${input} min-h-[90px]`} placeholder="Describe the extra work needed…" value={text} onChange={e => { setText(e.target.value); setErr('') }} />
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
            <button onClick={submit} disabled={busy} className="flex-1 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Adding…' : 'Add to ticket'}</button>
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

// ── Approve a supplier's proposed snag-fix date ─────────────────
export function AcceptSnagScheduleCard({ ticketId, scheduledAt }: { ticketId: string; scheduledAt: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function approve() {
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'approve_snag' }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <div className="rounded-xl ring-1 ring-indigo-500/40 bg-indigo-500/5 p-4 space-y-2">
      <p className="text-sm font-semibold text-[var(--text)]">Snag fix schedule</p>
      <p className="text-sm text-[var(--text-muted)]">The supplier proposed <span className="font-semibold text-[var(--text)]">{formatDateTime(scheduledAt)}</span> to carry out the corrective work. Approve to confirm so they can proceed.</p>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <button onClick={approve} disabled={busy} className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Approving…' : 'Approve snag schedule'}</button>
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
      <button onClick={go} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C6A35D] text-[#0a0e17] text-xs font-semibold disabled:opacity-50">{busy ? 'Sending…' : 'Ask to re-quote'}</button>
      {sent && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Re-quote request sent to the supplier.</p>}
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  )
}
