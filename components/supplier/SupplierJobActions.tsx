'use client'

// Supplier "Schedule job" action — a green button that opens a themed calendar
// (date + 1-hour time slot, capped by the ticket priority window and operating
// hours). The Submit COC & POC flow lives on its own page (/complete).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Wrench, Plus, PlayCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { DrawerHeader } from '@/components/exec/Drawer'
import { SchedulePicker } from '@/components/ui/SchedulePicker'
import { SendQuoteForm } from '@/components/admin/SendQuoteForm'
import { createClient } from '@/lib/supabase/client'

async function transition(ticketId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/tickets/${ticketId}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Something went wrong')
}

// Decline the work (before award) — a pop-up with preset reasons + free-text
// "Other". Sets the supplier's invite to declined and notifies the RM.
const DECLINE_REASONS = ['Fully booked / no capacity', 'Outside our service area', 'Not our trade / speciality', 'Pricing not viable', 'Other']
export function DeclineWorkButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)]'

  async function submit() {
    if (!reason) { setErr('Choose a reason.'); return }
    const finalReason = reason === 'Other' ? other.trim() : reason
    if (!finalReason) { setErr('Tell the manager why.'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/supplier/decline-work', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId, reason: finalReason }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full py-2.5 rounded-xl ring-1 ring-red-500/40 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-500/10 transition">Decline work</button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-md">
          {close => (
            <>
              <DrawerHeader onClose={close} title={<p className="font-semibold text-[var(--text)]">Decline this work</p>} />
              <p className="text-xs text-[var(--text-muted)]">The manager is notified and the job goes to other suppliers. This can&apos;t be undone.</p>
              <select autoFocus className={input} value={reason} onChange={e => { setReason(e.target.value); setErr('') }}>
                <option value="">— Choose a reason —</option>
                {DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {reason === 'Other' && <textarea className={`${input} min-h-[80px]`} placeholder="Tell the manager why…" value={other} onChange={e => setOther(e.target.value)} />}
              {err && <p className="text-xs text-red-500">{err}</p>}
              <div className="flex gap-2">
                <button onClick={submit} disabled={busy} className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500 disabled:opacity-50">{busy ? 'Declining…' : 'Decline work'}</button>
                <button onClick={close} disabled={busy} className="flex-1 py-2 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Cancel</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  )
}


// Accept a raised snag and schedule when the corrective work will happen — opens
// the same themed calendar as Schedule job (no technician step).
export function AcceptSnagCard({ ticketId, priority, createdAt }: { ticketId: string; priority: string; createdAt: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function doAccept(iso: string) {
    setBusy(true); setErr('')
    try { await transition(ticketId, { action: 'accept_snag', scheduledAt: iso }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition flex items-center justify-center gap-1.5">
        <Calendar size={15} /> Accept snag &amp; schedule fix
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-sm">
          {close => (
            <>
              <DrawerHeader onClose={close} title={<p className="font-semibold text-[var(--text)]">Schedule the snag fix</p>} />
              {err && <p className="text-xs text-red-500">{err}</p>}
              <SchedulePicker priority={priority} createdAt={createdAt} busy={busy} onConfirm={doAccept} onCancel={close} />
            </>
          )}
        </Modal>
      )}
    </>
  )
}

// Assign a technician to the job — UI only for now (selection isn't persisted yet).
export function AssignTechnicianButton({ technicians = [] }: { technicians?: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false)
  const [techId, setTechId] = useState('')
  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full py-2.5 rounded-xl ring-1 ring-[var(--border)] text-[var(--text)] text-sm font-semibold hover:bg-[var(--hover)] transition flex items-center justify-center gap-1.5">
        <Wrench size={15} /> Assign technician
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="max-w-sm">
          {close => (
            <>
              <DrawerHeader onClose={close} title={<p className="font-semibold text-[var(--text)]">Assign a technician</p>} />
              {technicians.length ? (
                <select value={techId} onChange={e => setTechId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm outline-none focus:ring-emerald-500/40">
                  <option value="">— Select a technician —</option>
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">No technicians yet — add them under the <span className="text-blue-600 dark:text-blue-400">Technicians</span> tab.</p>
              )}
              <div className="flex gap-2">
                <button disabled={!techId} onClick={close} className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">Assign</button>
                <button onClick={close} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  )
}

// Mark the job in progress (start_work) — the first step after the quote is
// approved. Asks for an in-app confirmation before firing.
export function MarkInProgressButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState(false)
  async function go() {
    setBusy(true); setErr('')
    try { await transition(ticketId, { action: 'start_work' }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }
  if (confirm) {
    return (
      <div className="rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] p-3 space-y-2">
        <p className="text-sm text-[var(--text)]">Mark this job as in progress? The store will see that the work has started.</p>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-2">
          <button onClick={go} disabled={busy} className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Starting…' : 'Yes, mark in progress'}</button>
          <button onClick={() => { setConfirm(false); setErr('') }} disabled={busy} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Cancel</button>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-[var(--text-muted)]">
        Mark the ticket in progress when you&apos;re ready to start the job, or once the scheduled time has arrived. This lets the store know you&apos;re on your way or busy with the work.
      </p>
      <button onClick={() => setConfirm(true)} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition flex items-center justify-center gap-1.5">
        <PlayCircle size={15} /> Mark in progress
      </button>
    </div>
  )
}

// Variation-order gate for the close-out phase (approved_closeout / vo_declined):
// AFTER the COC/POC is approved, the supplier can raise a variation order for extra
// work — otherwise the RM does the final close-out. On vo_declined it leads with the
// RM's decline reason and lets the supplier re-submit a revised VO.
export function SupplierVariationGate({ ticketId, priority, createdAt, variationCount, status, declineReason, noVosConfirmed = false }: {
  ticketId: string; priority: string; createdAt: string; variationCount: number
  status: 'approved_closeout' | 'vo_declined'; declineReason?: string | null; noVosConfirmed?: boolean
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const hasVOs = variationCount > 0 || status === 'vo_declined'
  const raiseLabel = status === 'vo_declined' ? 'Re-submit variation order' : hasVOs ? 'Raise another variation order' : 'Raise variation order'

  async function confirmNoVos() {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/supplier/ticket-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId, action: 'confirm_no_vos' }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  // Once confirmed, the VO options are locked and the RM can close out.
  if (noVosConfirmed) {
    return <div className="rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3.5 text-sm text-[var(--text-muted)]">You confirmed there are no further variation orders. Awaiting the manager&apos;s final close-out.</div>
  }

  return (
    <div className="space-y-3">
      {status === 'vo_declined' ? (
        <div className="rounded-xl bg-red-500/10 ring-1 ring-red-500/30 p-3.5 space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Variation order declined</p>
          <p className="text-sm text-[var(--text)]">{declineReason || 'The regional manager declined your variation order.'}</p>
          <p className="text-sm text-[var(--text-muted)]">Submit a revised variation order, or confirm there are none so the manager can close out.</p>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">Your COC &amp; POC were approved. Raise a variation order for any extra work, or confirm there are none so the manager can close out.</p>
      )}
      <button onClick={() => setShowForm(v => !v)} className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition flex items-center justify-center gap-1.5">
        <Plus size={15} /> {raiseLabel}
      </button>
      {showForm && <SendQuoteForm ticketId={ticketId} variant="variation" competitive priority={priority} createdAt={createdAt} defaultOpen onClose={() => setShowForm(false)} />}
      {/* Confirm no further VOs → un-greys the RM's Final close-out (locked after). */}
      <button onClick={confirmNoVos} disabled={busy} className="w-full py-2.5 rounded-xl ring-1 ring-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-sm font-semibold hover:bg-emerald-500/10 transition disabled:opacity-50">{busy ? 'Confirming…' : 'No further variation orders — ready for close-out'}</button>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  )
}

// Start the snag fix — only shown once the RM has approved the proposed date.
export function StartSnagButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function go() {
    setBusy(true); setErr('')
    try { await transition(ticketId, { action: 'start_snag' }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <>
      <button onClick={go} disabled={busy} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition disabled:opacity-50">{busy ? 'Starting…' : 'Start snag fix (in progress)'}</button>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </>
  )
}

export function ScheduleJobCard({ ticketId, priority, createdAt, technicians = [] }: { ticketId: string; priority: string; createdAt: string; technicians?: { id: string; name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [techId, setTechId] = useState('')
  // Held date/time awaiting an in-app "schedule without a technician?" confirm.
  const [pendingIso, setPendingIso] = useState<string | null>(null)

  async function doSchedule(iso: string) {
    setBusy(true); setErr('')
    try { await transition(ticketId, { action: 'schedule', scheduledAt: iso, technicianId: techId || null }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }
  function confirm(iso: string) {
    // Date + time are enforced by the picker; the technician is optional — ask
    // for an in-app confirmation (no browser popup) if left unassigned.
    if (!techId) { setErr(''); setPendingIso(iso); return }
    doSchedule(iso)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition flex items-center justify-center gap-1.5">
        <Calendar size={15} /> Schedule job
      </button>
      {open && (
        <Modal onClose={() => { setOpen(false); setPendingIso(null) }} maxWidth="max-w-sm">
          {close => (
            <>
              <DrawerHeader onClose={close} title={<p className="font-semibold text-[var(--text)]">Schedule the job</p>} />
              {pendingIso ? (
                <div className="space-y-2">
                  <p className="text-sm text-[var(--text)]">No technician is assigned for this job. Schedule without one?</p>
                  {err && <p className="text-xs text-red-500">{err}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => doSchedule(pendingIso)} disabled={busy} className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50">{busy ? 'Scheduling…' : 'Yes, schedule'}</button>
                    <button onClick={() => setPendingIso(null)} disabled={busy} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Back</button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Assign a technician (from your roster) */}
                  <div>
                    <label className="block text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Technician</label>
                    {technicians.length ? (
                      <select value={techId} onChange={e => setTechId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm outline-none focus:ring-emerald-500/40">
                        <option value="">— Unassigned —</option>
                        {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    ) : (
                      <p className="text-xs text-[var(--text-muted)]">No technicians yet — add them under the <span className="text-blue-600 dark:text-blue-400">Technicians</span> tab.</p>
                    )}
                  </div>
                  {err && <p className="text-xs text-red-500">{err}</p>}
                  <SchedulePicker priority={priority} createdAt={createdAt} busy={busy} onConfirm={confirm} onCancel={close} />
                </>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  )
}
