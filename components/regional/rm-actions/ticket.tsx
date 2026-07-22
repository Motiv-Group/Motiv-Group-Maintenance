'use client'

// RM ticket-page actions: action bar + "More" menu, edit/add-work forms,
// request-info / evidence / snag buttons, cancel + misc ticket actions.
import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Camera, Info, X, ChevronDown, MessageSquare, XCircle, Send, AlertCircle, Trash2, FileUp, FileText } from 'lucide-react'
import { uploadFiles } from '@/lib/upload'
import { useFileDrop } from '@/components/ui/useFileDrop'
import { formatDateTime } from '@/lib/utils'
import { StarInput } from '@/components/ui/Stars'
import { TicketChat } from '@/components/chat/TicketChat'
import { Modal } from './modal'
import { post, errMsg, type SupplierChoice } from './shared'
import { AssignSuppliersButton } from './assign'

// ── "More" dropdown — a compact button (sits next to the primary action) that
// drops a floating menu of secondary/destructive actions. It ONLY renders the menu
// buttons; the actual modals live as siblings in RmTicketActionBar driven by lifted
// state, so opening one is instant and doesn't depend on the menu staying mounted.
// `inline` (opt-in) renders the dropdown as an absolutely-positioned element
// INSIDE this trigger's relative wrapper instead of portalling to <body> — so it
// stays within the parent block (e.g. the SM Next-action card) and can't escape
// into the card below. Every existing caller leaves it false (portalled).
export function MoreMenu({ children, fullWidth = false, label = 'More', up = false, align = 'right', inline = false }: { children: ReactNode; fullWidth?: boolean; label?: string; up?: boolean; align?: 'left' | 'right'; inline?: boolean }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  // The menu is PORTALLED to <body> and fixed-positioned against the trigger, so
  // it's never clipped by a pop-up's `overflow-y-auto` body (which also clips
  // overflow-x, cutting the old absolute menu off to the side). Left is clamped
  // into the viewport so a 256px menu can't run off a phone edge. Scroll/resize
  // just closes it — simpler and correct vs. live repositioning. Skipped in
  // `inline` mode, which positions against the wrapper and needs no portal.
  useEffect(() => {
    if (!open || inline) return
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect()
      if (!b) return
      const width = Math.min(256, window.innerWidth - 16)
      let left = align === 'left' ? b.left : b.right - width
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      setPos({ top: up ? b.top - 8 : b.bottom + 8, left, width })
    }
    place()
    const onMove = () => setOpen(false)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => { window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove) }
  }, [open, align, up, inline])

  // Inline mode has no portal + click-catcher, so close on any outside click via
  // a document listener scoped to while it's open. Clicks on the trigger/panel
  // are inside the wrapper, so they don't self-close (the panel handles its own).
  useEffect(() => {
    if (!open || !inline) return
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, inline])

  return (
    <div ref={wrapRef} className={`relative ${fullWidth ? '' : 'shrink-0'}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`${fullWidth ? 'w-full justify-center' : ''} flex items-center gap-1.5 py-2.5 px-4 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm font-semibold hover:bg-[var(--hover)] transition`}
      >
        {label} <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {/* Inline: absolutely-positioned panel INSIDE the relative wrapper (right/left
          per `align`, below/above per `up`). Right-aligned + capped width keep it
          off the 375px viewport edge. Same panel styling as the portalled menu. */}
      {open && inline && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className={`absolute z-10 ${up ? 'bottom-full mb-2' : 'top-full mt-2'} ${align === 'left' ? 'left-0' : 'right-0'} w-56 max-w-[calc(100vw-2rem)] rounded-xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] shadow-lg shadow-black/20 p-1.5 space-y-0.5`}
        >
          {children}
        </div>
      )}
      {open && !inline && pos && createPortal(
        <>
          {/* Outside-click catcher (below the menu, above everything else). */}
          <button aria-hidden tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-[110] cursor-default" />
          <div
            role="menu"
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, transform: up ? 'translateY(-100%)' : undefined }}
            className="z-[111] rounded-xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] shadow-lg shadow-black/20 p-1.5 space-y-0.5"
          >
            {children}
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}

type ActionKey = 'addwork' | 'info' | 'edit' | 'cancel' | 'chat'

// The RM Next-action cluster: one primary button (Assign supplier) + a "More"
// dropdown holding the secondary/destructive actions (add extra work, request info,
// chat with the supplier once one is awarded, edit, cancel). The dropdown items just
// set which modal is active; the modals are rendered as SIBLINGS (mounted only when
// active) so they open instantly — the previous approach kept them inside the
// collapsing menu, which felt laggy/buggy.
// Client component (a Server Component may not pass the click handlers).
export function RmTicketActionBar({ ticketId, status, canAssign, canAssignSupplier, canCancel, canEdit, hasSupplier = false, jobRef, suppliers, motivSuppliers, motivAccess = 'none', declinedSupplierIds, awaitingById, description, photoUrls, docUrls, title, category, impact, priority }: {
  ticketId: string
  status: string
  canAssign: boolean
  canAssignSupplier: boolean
  canCancel: boolean
  canEdit: boolean
  hasSupplier?: boolean
  jobRef?: string | null
  suppliers: SupplierChoice[]
  motivSuppliers: SupplierChoice[]
  motivAccess?: 'none' | 'pending' | 'approved' | 'rejected'
  declinedSupplierIds: string[]
  awaitingById: Record<string, 'invited' | 'quoted'>
  description: string
  photoUrls: string[]
  docUrls: string[]
  title: string
  category: string
  impact: string
  priority: string
}) {
  const [active, setActive] = useState<ActionKey | null>(null)
  const done = () => setActive(null)
  const showRequestInfo = ['open', 'info_requested'].includes(status)
  const hasPrimary = canAssignSupplier
  const hasMenu = canAssign || showRequestInfo || canEdit || canCancel || hasSupplier
  const primaryCls = `${hasMenu ? 'flex-1' : 'w-full'} py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition`
  // Once one or more suppliers have already been invited/quoted, assigning is
  // adding ANOTHER supplier — reflect that in the button label.
  const assignLabel = Object.keys(awaitingById).length > 0 ? 'Request another supplier' : 'Assign supplier'
  // With no primary action a lone floating "More" chip looks broken — surface the
  // remaining actions as outline buttons instead (chat also lives on the FAB).
  const outlineCls = 'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 ring-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)] transition'
  const outlineDangerCls = 'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 ring-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition'
  return (
    <>
      {hasPrimary ? (
        <div className="flex items-center gap-2">
          <AssignSuppliersButton ticketId={ticketId} suppliers={suppliers} motivSuppliers={motivSuppliers} motivAccess={motivAccess} declinedSupplierIds={declinedSupplierIds} awaitingById={awaitingById}
            trigger={open => <button onClick={open} className={primaryCls}>{assignLabel}</button>} />
          {hasMenu && (
            <MoreMenu inline align="right">
              {canAssign && <MoreActionItem icon={<Plus size={16} />} label="Add extra work" onClick={() => setActive('addwork')} />}
              {showRequestInfo && <MoreActionItem icon={<MessageSquare size={16} />} label="Request more info" onClick={() => setActive('info')} />}
              {hasSupplier && <MoreActionItem icon={<MessageSquare size={16} />} label="Chat with supplier" onClick={() => setActive('chat')} />}
              {canEdit && <MoreActionItem icon={<Pencil size={16} />} label="Edit ticket" onClick={() => setActive('edit')} />}
              {canCancel && <MoreActionItem icon={<XCircle size={16} />} label="Cancel ticket" tone="danger" onClick={() => setActive('cancel')} />}
            </MoreMenu>
          )}
        </div>
      ) : hasMenu ? (
        <div className="flex flex-wrap items-center gap-2">
          {canAssign && <button onClick={() => setActive('addwork')} className={outlineCls}><Plus size={15} /> Add extra work</button>}
          {showRequestInfo && <button onClick={() => setActive('info')} className={outlineCls}><MessageSquare size={15} /> Request more info</button>}
          {hasSupplier && <button onClick={() => setActive('chat')} className={outlineCls}><MessageSquare size={15} /> Chat with supplier</button>}
          {canEdit && <button onClick={() => setActive('edit')} className={outlineCls}><Pencil size={15} /> Edit ticket</button>}
          {canCancel && <button onClick={() => setActive('cancel')} className={outlineDangerCls}><XCircle size={15} /> Cancel ticket</button>}
        </div>
      ) : null}

      {/* Action modals — mounted only while active, so they appear instantly. */}
      {active === 'addwork' && <RmAddWorkForm defaultOpen onClose={done} ticketId={ticketId} description={description} photoUrls={photoUrls} docUrls={docUrls} title={title} category={category} impact={impact} />}
      {active === 'info' && <RequestInfoButton defaultOpen onClose={done} ticketId={ticketId} />}
      {active === 'edit' && <RmEditTicketForm defaultOpen onClose={done} ticketId={ticketId} initial={{ title, category, impact, priority, description }} />}
      {active === 'cancel' && <CancelTicketCard defaultOpen onClose={done} ticketId={ticketId} jobRef={jobRef} />}
      {/* Chat opens as a sibling — the supplier is awarded once hasSupplier is set. */}
      {active === 'chat' && <TicketChat ticketId={ticketId} viewerRole="regional_manager" defaultOpen onClose={done} />}
    </>
  )
}

/** A single row inside the <MoreMenu> dropdown — icon + label, tinted red for
 *  destructive actions. Borderless menu-row styling. */
export function MoreActionItem({ icon, label, onClick, tone = 'default' }: { icon?: ReactNode; label: string; onClick: () => void; tone?: 'default' | 'danger' }) {
  const toneCls = tone === 'danger'
    ? 'text-red-600 dark:text-red-400 hover:bg-red-500/10'
    : 'text-[var(--text)] hover:bg-[var(--hover)]'
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition ${toneCls}`}>
      {icon && <span className={`shrink-0 ${tone === 'danger' ? '' : 'text-[var(--text-muted)]'}`}>{icon}</span>}
      {label}
    </button>
  )
}

// ── Request more info (amber button → modal) ────────────────────
// Reason quick-pick + free-text message are BOTH optional — if the RM sends
// nothing specific, a neutral "please review" note goes to the store manager.
const INFO_REASONS = ['Need more detail', 'Photos unclear', 'Scope unclear', 'Access details needed']

const MAX_INFO_MSG = 1000
export function RequestInfoButton({ ticketId, defaultOpen = false, onClose, trigger }: { ticketId: string; defaultOpen?: boolean; onClose?: () => void; trigger?: (open: () => void) => ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [preset, setPreset] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const close = () => { setOpen(false); onClose?.() }

  async function submit() {
    // Nothing required — build the note from whatever was given, else a default.
    const reason = [preset, message.trim()].filter(Boolean).join(' — ') || 'Please review the ticket and add any missing detail.'
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'request_info', reason }); setPreset(''); setMessage(''); close(); setBusy(false); router.refresh() }
    catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)]'
  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (!defaultOpen &&
        <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition">Request more info</button>
      )}
      {open && (
        <Modal maxWidth="max-w-lg" title="Request more information" onClose={() => { if (!busy) close() }}>
          <p className="-mt-1 text-sm text-[var(--text-muted)]">The store manager will see this message and can respond.</p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">What do you need more information about? <span className="font-normal text-[var(--text-faint)]">(optional)</span></label>
            <select autoFocus className={input} value={preset} onChange={e => setPreset(e.target.value)}>
              <option value="">Select a reason</option>
              {INFO_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Your message to the store manager <span className="font-normal text-[var(--text-faint)]">(optional)</span></label>
            <div className="relative">
              <textarea maxLength={MAX_INFO_MSG} className={`${input} min-h-[110px] pb-7`} placeholder="Type your message…" value={message} onChange={e => setMessage(e.target.value.slice(0, MAX_INFO_MSG))} />
              <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] tabular-nums text-[var(--text-faint)]">{message.length} / {MAX_INFO_MSG}</span>
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/25 px-3.5 py-3">
            <Info size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">What happens next?</p>
              <p className="text-sm text-[var(--text-muted)]">The store manager is notified of your request. Once they respond, you can continue with the ticket.</p>
            </div>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={close} disabled={busy} className="flex-1 py-2.5 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm font-medium disabled:opacity-50">Cancel</button>
            <button disabled={busy} onClick={submit} className="flex flex-1 items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50"><Send size={15} /> {busy ? 'Sending…' : 'Send request'}</button>
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

export function RequestEvidenceButton({ ticketId, defaultOpen = false, onClose, trigger }: { ticketId: string; defaultOpen?: boolean; onClose?: () => void; trigger?: (open: () => void) => ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [preset, setPreset] = useState('')
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const close = () => { setOpen(false); onClose?.() }

  async function submit() {
    if (!preset) { setErr('Choose what evidence is needed.'); return }
    const reason = preset === 'Other' ? other.trim() : preset
    if (!reason) { setErr('Tell the supplier what evidence you need.'); return }
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'request_evidence', reason }); setPreset(''); setOther(''); setBusy(false); close(); router.refresh() }
    catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'
  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (!defaultOpen &&
        <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-[#0a0e17] text-sm font-semibold transition">Request more evidence</button>
      )}
      {open && (
        <Modal title="Request more evidence" onClose={close}>
          <p className="text-xs text-[var(--text-muted)]">The supplier is asked to add the missing evidence and resubmit the COC &amp; POC.</p>
          <select autoFocus className={input} value={preset} onChange={e => setPreset(e.target.value)}>
            <option value="">— Choose what&apos;s needed —</option>
            {EVIDENCE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {preset === 'Other' && <textarea className={`${input} min-h-[80px]`} placeholder="What evidence do you need?" value={other} onChange={e => setOther(e.target.value)} />}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={submit} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Sending…' : 'Send request'}</button>
            <button onClick={close} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Raise snag (red button → modal, mirrors Request more info) ───
const SNAG_REASONS = ['Work incomplete', 'Quality below standard', 'Wrong materials or spec', 'Safety concern', 'Other']

export function RaiseSnagButton({ ticketId, defaultOpen = false, onClose, trigger }: { ticketId: string; defaultOpen?: boolean; onClose?: () => void; trigger?: (open: () => void) => ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [preset, setPreset] = useState('')
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const close = () => { setOpen(false); onClose?.() }

  async function submit() {
    if (!preset) { setErr('Choose the snag reason.'); return }
    const description = preset === 'Other' ? other.trim() : preset
    if (!description) { setErr('Describe the snag.'); return }
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'raise_snag', description }); setPreset(''); setOther(''); setBusy(false); close(); router.refresh() }
    catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'
  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (!defaultOpen &&
        <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition">Raise snag</button>
      )}
      {open && (
        <Modal title="Raise a snag" onClose={close}>
          <p className="text-xs text-[var(--text-muted)]">The completion is sent back. The supplier accepts the snag, schedules the corrective work and resubmits.</p>
          <select autoFocus className={input} value={preset} onChange={e => setPreset(e.target.value)}>
            <option value="">— Choose a reason —</option>
            {SNAG_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {preset === 'Other' && <textarea className={`${input} min-h-[80px]`} placeholder="Describe the snag…" value={other} onChange={e => setOther(e.target.value)} />}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={submit} className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Raising…' : 'Raise snag'}</button>
            <button onClick={close} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
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

const MAX_EDIT_DESC = 2000
function ReqLabel({ label, children }: { label: string; children: ReactNode }) {
  return <div><label className="mb-1.5 block text-sm font-medium text-[var(--text)]">{label} <span className="text-red-500">*</span></label>{children}</div>
}
export function RmEditTicketForm({ ticketId, initial, defaultOpen = false, onClose, trigger }: { ticketId: string; initial: { title: string; category: string; impact: string; priority: string; description: string }; defaultOpen?: boolean; onClose?: () => void; trigger?: (open: () => void) => ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [title, setTitle] = useState(initial.title)
  const [category, setCategory] = useState(initial.category || 'General')
  const [impact, setImpact] = useState(initial.impact || 'none')
  const [priority, setPriority] = useState(initial.priority || 'P3')
  const [description, setDescription] = useState(initial.description)
  const close = () => { setOpen(false); onClose?.() }
  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm'

  async function save() {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description, category, operational_impact: impact, priority }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to save')
      setBusy(false); close(); router.refresh()   // reset busy so a second edit isn't stuck on "Saving…"
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (!defaultOpen &&
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"><Pencil size={13} /> Edit ticket</button>
      )}
      {open && (
        <Modal maxWidth="max-w-lg" title="Edit ticket" onClose={() => { if (!busy) close() }}>
          <ReqLabel label="Title"><input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" /></ReqLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ReqLabel label="Category"><select className={input} value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></ReqLabel>
            <ReqLabel label="Priority"><select className={input} value={priority} onChange={e => setPriority(e.target.value)}>{PRIORITIES.map(p => <option key={p.v} value={p.v}>{p.label}</option>)}</select></ReqLabel>
          </div>
          <ReqLabel label="Operational Impact"><select className={input} value={impact} onChange={e => setImpact(e.target.value)}>{IMPACTS.map(i => <option key={i.v} value={i.v}>{i.label}</option>)}</select></ReqLabel>
          <ReqLabel label="Description">
            <div className="relative">
              <textarea maxLength={MAX_EDIT_DESC} className={`${input} min-h-[120px] pb-7`} value={description} onChange={e => setDescription(e.target.value.slice(0, MAX_EDIT_DESC))} placeholder="Description" />
              <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] tabular-nums text-[var(--text-faint)]">{description.length} / {MAX_EDIT_DESC}</span>
            </div>
          </ReqLabel>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={close} disabled={busy} className="flex-1 py-2.5 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm font-medium disabled:opacity-50">Cancel</button>
            <button disabled={busy} onClick={save} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── RM adds extra work to the ticket (before a supplier is assigned) ─
const MAX_WORK_CHARS = 1000
const MAX_WORK_PHOTOS = 5
const MAX_WORK_DOCS = 5
const WORK_DOC_ACCEPT = '.pdf,.doc,.docx,application/pdf'
export function RmAddWorkForm({ ticketId, description, photoUrls, docUrls, title, category, impact, defaultOpen = false, onClose, trigger }: {
  ticketId: string; description: string; photoUrls: string[]; docUrls: string[]; title: string; category: string; impact: string; defaultOpen?: boolean; onClose?: () => void; trigger?: (open: () => void) => ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [docs, setDocs] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const close = () => { setOpen(false); onClose?.() }
  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)]'

  // Object-URL thumbnails for the selected photos; revoked when the set changes.
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews])
  // Keep files the OS picker returned. On mobile the picked image often has an
  // empty MIME type (Android WebView), so require-image would silently drop it —
  // the `accept="image/*"` picker already limits selection, and the upload route
  // accepts an empty type, so only reject a clearly non-image type here.
  // Takes a File[] so BOTH the <input onChange> (Array.from of the live FileList,
  // snapshotted synchronously before the input value is cleared) and drag-drop
  // route through the same validation/cap path.
  const addFiles = (picked: File[]) => {
    const imgs = picked.filter(f => !f.type || f.type.startsWith('image/'))
    setFiles(p => [...p, ...imgs].slice(0, MAX_WORK_PHOTOS))
  }
  // Documents (PDF/Word) — non-image only (the accept list already limits the
  // picker), capped at 5. Same File[] path shared by input + drag-drop.
  const addDocs = (picked: File[]) => {
    const dcs = picked.filter(f => !f.type.startsWith('image/'))
    setDocs(p => [...p, ...dcs].slice(0, MAX_WORK_DOCS))
  }

  // Drag-and-drop mirrors each input's accept/multiple/at-capacity condition and
  // funnels dropped files through the same addFiles/addDocs handlers.
  const photosFull = files.length >= MAX_WORK_PHOTOS
  const docsFull = docs.length >= MAX_WORK_DOCS
  const { isDragging: photoDragging, dropProps: photoDrop } = useFileDrop({ onFiles: addFiles, accept: 'image/*', multiple: true, disabled: photosFull })
  const { isDragging: docDragging, dropProps: docDrop } = useFileDrop({ onFiles: addDocs, accept: WORK_DOC_ACCEPT, multiple: true, disabled: docsFull })

  async function submit() {
    if (!text.trim()) { setErr('Describe the extra work needed.'); return }
    setBusy(true); setErr('')
    try {
      // Photos → ticket-photos, documents → ticket-docs (same buckets as the SM flows).
      const [{ urls: newUrls, failed }, { urls: newDocUrls, failed: docFailed }] = await Promise.all([
        uploadFiles(files, 'ticket-photos'),
        uploadFiles(docs, 'ticket-docs'),
      ])
      const nFailed = failed.length + docFailed.length
      if (nFailed) { setErr(`Couldn't upload ${nFailed} file${nFailed > 1 ? 's' : ''}. Check the file type and try again.`); setBusy(false); return }
      const newDescription = `${description}\n\n— Extra Work: ${text.trim()}`
      // The ticket endpoint is PATCH-only — POSTing here was the "something went wrong".
      // Docs append to info_doc_urls exactly like the SM add-info flow (existing + new).
      const res = await fetch(`/api/tickets/${ticketId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description: newDescription, category, operational_impact: impact, photo_urls: [...photoUrls, ...newUrls], info_doc_urls: [...docUrls, ...newDocUrls], edit_note: 'added extra work' }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to add the extra work.')
      setBusy(false); setText(''); setFiles([]); setDocs([]); close(); router.refresh()
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (!defaultOpen &&
        <button onClick={() => setOpen(true)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition">
          <Plus size={16} /> Add extra work
        </button>
      )}
      {open && (
        <Modal title="Add extra work to this ticket" maxWidth="max-w-2xl" onClose={() => { if (!busy) { setErr(''); close() } }}>
          <p className="-mt-1 text-sm text-[var(--text-muted)]">Add any additional scope or tasks you want the supplier to include in their quote.</p>

          {/* Description + live character counter */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Describe the extra work needed <span className="text-red-500">*</span></label>
            <div className="relative">
              <textarea autoFocus maxLength={MAX_WORK_CHARS} className={`${input} min-h-[150px] pb-7`} placeholder="e.g. Install an additional shut-off valve and pressure-test the line…" value={text} onChange={e => { setText(e.target.value.slice(0, MAX_WORK_CHARS)); setErr('') }} />
              <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] tabular-nums text-[var(--text-faint)]">{text.length} / {MAX_WORK_CHARS}</span>
            </div>
          </div>

          {/* Photo grid — dashed upload tile + image thumbnails with remove */}
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--text)]">Add photos <span className="font-normal text-[var(--text-faint)]">(optional)</span></p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {files.length < MAX_WORK_PHOTOS && (
                <label {...photoDrop} className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-2 text-center text-[var(--text-muted)] transition hover:border-blue-500 hover:bg-[var(--hover)] ${photoDragging ? 'border-blue-500 bg-blue-500/5 ring-2 ring-blue-500' : 'border-[var(--border)]'}`}>
                  <Camera size={20} className="text-[var(--text-faint)]" />
                  <span className="text-[11px] font-medium leading-tight">{photoDragging ? 'Drop photos here' : 'Upload photos'}</span>
                  <span className="text-[10px] leading-tight text-[var(--text-faint)]">PNG, JPG up to 10MB</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.currentTarget.value = '' }} />
                </label>
              )}
              {files.map((f, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-xl ring-1 ring-[var(--border)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL preview, not a remote asset */}
                  <img src={previews[i]} alt={f.name} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setFiles(p => p.filter((_, j) => j !== i))} aria-label="Remove photo" className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"><X size={13} /></button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--text-faint)]">{files.length} of {MAX_WORK_PHOTOS} photos added</p>
          </div>

          {/* Documents — compact picker row + chosen-file list with remove. Uploaded
              to ticket-docs and appended to info_doc_urls (SM add-info pattern). */}
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--text)]">Attach documents <span className="font-normal text-[var(--text-faint)]">(optional)</span></p>
            {docs.length < MAX_WORK_DOCS && (
              <label {...docDrop} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-3 text-sm font-medium text-[var(--text-muted)] transition hover:border-blue-500 hover:bg-[var(--hover)] ${docDragging ? 'border-blue-500 bg-blue-500/5 ring-2 ring-blue-500' : 'border-[var(--border)]'}`}>
                <FileUp size={16} className="shrink-0 text-[var(--text-faint)]" /> {docDragging ? 'Drop documents here' : 'Choose documents'}
                <span className="text-[11px] font-normal text-[var(--text-faint)]">PDF or Word</span>
                <input type="file" accept={WORK_DOC_ACCEPT} multiple className="hidden" onChange={e => { addDocs(Array.from(e.target.files ?? [])); e.currentTarget.value = '' }} />
              </label>
            )}
            {docs.length > 0 && (
              <ul className="mt-2 space-y-1">
                {docs.map((d, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-[var(--text)]"><FileText size={14} className="shrink-0 text-blue-500" /> <span className="truncate">{d.name}</span></span>
                    <button type="button" onClick={() => setDocs(p => p.filter((_, j) => j !== i))} aria-label="Remove document" className="shrink-0 text-[var(--text-faint)] hover:text-red-500" title="Remove"><X size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Info callout */}
          <div className="flex items-start gap-2.5 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/25 px-3.5 py-3">
            <Info size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
            <p className="text-sm text-[var(--text-muted)]">This extra work will be included in the quote request sent to the supplier.</p>
          </div>

          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setErr(''); close() }} disabled={busy} className="flex-1 py-2.5 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm font-medium disabled:opacity-50">Cancel</button>
            <button onClick={submit} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Adding…' : 'Add to ticket'}</button>
          </div>
        </Modal>
      )}
    </>
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
    catch (e) { setErr(errMsg(e)); setBusy(false) }
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

// ── Cancel ticket (with reason) ─────────────────────────────────
const CANCEL_REASONS = ['Duplicate ticket', 'Issue resolved itself', 'Not a maintenance issue', 'Store closed', 'Logged in error', 'Other']
const MAX_CANCEL_NOTE = 500
export function CancelTicketCard({ ticketId, jobRef, defaultOpen = false, onClose, trigger }: { ticketId: string; jobRef?: string | null; defaultOpen?: boolean; onClose?: () => void; trigger?: (open: () => void) => ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [reason, setReason] = useState(CANCEL_REASONS[0])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const close = () => { setOpen(false); onClose?.() }

  async function cancel() {
    setBusy(true); setErr('')
    // Note is optional context appended to the required reason.
    const finalReason = [reason, note.trim()].filter(Boolean).join(' — ')
    try { await post(`/api/tickets/${ticketId}/transition`, { action: 'reject', reason: finalReason }); close(); setBusy(false); router.refresh() }
    catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)]'
  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (!defaultOpen &&
        <button onClick={() => setOpen(true)} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition">Cancel ticket</button>
      )}
      {open && (
        <Modal maxWidth="max-w-lg" onClose={() => { if (!busy) close() }} title={
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400"><AlertCircle size={18} /></span>
            <span className="text-lg font-bold text-[var(--text)]">Cancel ticket{jobRef ? ` ${jobRef}` : ''}?</span>
          </span>
        }>
          <div className="space-y-0.5 border-b border-[var(--border)] pb-3 text-sm text-[var(--text-muted)]">
            <p>This will close the ticket and notify the store manager.</p>
            <p>Any outstanding quote requests will be withdrawn.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Reason <span className="text-red-500">*</span></label>
            <select className={input} value={reason} onChange={e => setReason(e.target.value)}>{CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Additional note <span className="font-normal text-[var(--text-faint)]">(optional)</span></label>
            <div className="relative">
              <textarea maxLength={MAX_CANCEL_NOTE} className={`${input} min-h-[110px] pb-7`} placeholder="Explain why the ticket is being cancelled…" value={note} onChange={e => setNote(e.target.value.slice(0, MAX_CANCEL_NOTE))} />
              <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] tabular-nums text-[var(--text-faint)]">{note.length} / {MAX_CANCEL_NOTE}</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl bg-red-500/[0.07] ring-1 ring-red-500/30 px-3.5 py-3">
            <Info size={16} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
            <p className="text-sm text-[var(--text-muted)]"><span className="text-[var(--text)]">This action <span className="font-semibold text-red-600 dark:text-red-400">cannot be undone</span>.</span> If this ticket was created by mistake, consider creating a new ticket instead.</p>
          </div>

          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={close} disabled={busy} className="flex-1 py-2.5 rounded-xl ring-1 ring-[var(--border)] text-[var(--text)] text-sm font-medium transition hover:bg-[var(--hover)] disabled:opacity-50">Keep ticket</button>
            <button disabled={busy} onClick={cancel} className="flex flex-1 items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-50"><Trash2 size={16} /> {busy ? 'Cancelling…' : 'Cancel ticket'}</button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Supplier rating block (shared by the close-out flows) ───────
// The REQUIRED 1–5 star score + optional comment card used by CloseOutButton
// below AND the RM Today queue's close-out pop-up (RegionalPriorityWorkQueue's
// CloseOutConfirm) so both flows stay identical.
export function SupplierRatingCard({ score, comment, onScore, onComment }: { score: number; comment: string; onScore: (v: number) => void; onComment: (v: string) => void }) {
  return (
    <div className="space-y-2 rounded-xl p-4 ring-1 ring-[var(--border)]">
      <p className="text-sm font-semibold text-[var(--text)]">Rate the supplier <span className="text-red-500">*</span></p>
      <StarInput value={score} onChange={onScore} />
      <p className="text-[11px] text-[var(--text-faint)]">Tap a star to rate</p>
      <div className="relative">
        <textarea maxLength={250} value={comment} onChange={e => onComment(e.target.value.slice(0, 250))} placeholder="Comment on the supplier's work (optional)"
          className="min-h-[64px] w-full rounded-lg bg-[var(--input-bg)] px-3 py-2 pb-6 text-sm text-[var(--text)] ring-1 ring-[var(--border)]" />
        <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] tabular-nums text-[var(--text-faint)]">{comment.length}/250</span>
      </div>
    </div>
  )
}

// ── Final close-out — greyed until the supplier confirms no more VOs ─
// The confirm pop-up asks for the supplier rating (moved here from the sign-off
// approval): a REQUIRED 1–5 star score + optional comment, posted to /api/ratings
// before the close_out transition. Used by the RM ticket page (via CloseOutBar)
// AND the individual (job-owner) ticket page — /api/ratings accepts both roles.
export function CloseOutButton({ ticketId, voConfirmed }: { ticketId: string; voConfirmed: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const close = () => { if (!busy) { setOpen(false); setErr('') } }

  async function closeOut() {
    if (!score) { setErr('Please give the supplier a star rating before closing out.'); return }
    setBusy(true); setErr('')
    try {
      await post(`/api/ratings`, { ticketId, score, comment })
      await post(`/api/tickets/${ticketId}/transition`, { action: 'close_out' })
      setOpen(false); router.refresh()
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <div className="space-y-1.5">
      {!voConfirmed && <p className="text-xs text-[var(--text-muted)]">Waiting for the supplier to confirm there are no further variation orders before you can close out.</p>}
      <button onClick={() => setOpen(true)} disabled={!voConfirmed} className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed">Final close-out</button>
      {open && (
        <Modal title="Final close-out" onClose={close}>
          <p className="-mt-1 text-sm text-[var(--text-muted)]">Rate the supplier&apos;s work to complete the job — the ticket is closed once you confirm.</p>
          <SupplierRatingCard score={score} comment={comment} onScore={v => { setScore(v); setErr('') }} onComment={setComment} />
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={close} disabled={busy} className="flex-1 py-2.5 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm font-medium disabled:opacity-50">Cancel</button>
            <button onClick={closeOut} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition disabled:opacity-50">{busy ? 'Closing out…' : 'Close out'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Close-out area (RM ticket page) — Final close-out + a small "More" beside it
// holding the secondary chat entry. The chat modal is a sibling driven by lifted
// state (same pattern as RmTicketActionBar); the menu opens up-right since the
// button sits near the bottom of the Next-action card.
// Client component (a Server Component may not pass the click handlers).
export function CloseOutBar({ ticketId, voConfirmed }: { ticketId: string; voConfirmed: boolean }) {
  const [chat, setChat] = useState(false)
  return (
    <>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1"><CloseOutButton ticketId={ticketId} voConfirmed={voConfirmed} /></div>
        <MoreMenu inline up align="right">
          <MoreActionItem icon={<MessageSquare size={16} />} label="Chat with the supplier" onClick={() => setChat(true)} />
        </MoreMenu>
      </div>
      {chat && <TicketChat ticketId={ticketId} viewerRole="regional_manager" defaultOpen onClose={() => setChat(false)} />}
    </>
  )
}
