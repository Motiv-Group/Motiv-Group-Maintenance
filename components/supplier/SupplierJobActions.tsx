'use client'

// Supplier "Schedule job" action — a green button that opens a themed calendar
// (date + 1-hour time slot, capped by the ticket priority window and operating
// hours). The Submit COC & POC flow lives on its own page (/complete).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, X, FileText, Wrench } from 'lucide-react'
import { SchedulePicker } from '@/components/ui/SchedulePicker'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'

async function transition(ticketId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/tickets/${ticketId}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Something went wrong')
}

// Centered pop-up (mirrors the RM "Request more info" modal) for supplier actions.
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[var(--surface-2)] ring-1 ring-[var(--border)] rounded-2xl p-5 max-w-md w-full space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-[var(--text)]">{title}</p>
          <button onClick={onClose} className="p-1 -m-1 text-[var(--text-faint)] hover:text-[var(--text)]"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
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
      <Button onClick={() => setOpen(true)} variant="danger" className="w-full">Decline work</Button>
      {open && (
        <Modal title="Decline this work" onClose={() => { if (!busy) setOpen(false) }}>
          <p className="text-xs text-[var(--text-muted)]">The manager is notified and the job goes to other suppliers. This can&apos;t be undone.</p>
          <select autoFocus className={input} value={reason} onChange={e => { setReason(e.target.value); setErr('') }}>
            <option value="">— Choose a reason —</option>
            {DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {reason === 'Other' && <textarea className={`${input} min-h-[80px]`} placeholder="Tell the manager why…" value={other} onChange={e => setOther(e.target.value)} />}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={busy} className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500 disabled:opacity-50">{busy ? 'Declining…' : 'Decline work'}</button>
            <button onClick={() => setOpen(false)} disabled={busy} className="flex-1 py-2 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Cancel</button>
          </div>
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
      <button onClick={() => setOpen(true)} className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition flex items-center justify-center gap-1.5">
        <Calendar size={15} /> Accept snag &amp; schedule fix
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-[var(--surface-2)] ring-1 ring-[var(--border)] rounded-2xl p-5 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-[var(--text)]">Schedule the snag fix</p>
            {err && <p className="text-xs text-red-500">{err}</p>}
            <SchedulePicker priority={priority} createdAt={createdAt} busy={busy} onConfirm={doAccept} onCancel={() => setOpen(false)} />
          </div>
        </div>
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-[var(--surface-2)] ring-1 ring-[var(--border)] rounded-2xl p-5 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-[var(--text)]">Assign a technician</p>
            {technicians.length ? (
              <select value={techId} onChange={e => setTechId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm outline-none focus:ring-[#C6A35D]/40">
                <option value="">— Select a technician —</option>
                {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">No technicians yet — add them under the <span className="text-[#C6A35D]">Technicians</span> tab.</p>
            )}
            <div className="flex gap-2">
              <button disabled={!techId} onClick={() => setOpen(false)} className="flex-1 py-2 rounded-lg bg-[#C6A35D] text-[#0a0e17] text-sm font-semibold disabled:opacity-50">Assign</button>
              <button onClick={() => setOpen(false)} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
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
      <button onClick={go} disabled={busy} className="w-full py-2.5 rounded-xl bg-[#C6A35D] hover:bg-amber-600 text-[#0a0e17] text-sm font-semibold transition disabled:opacity-50">{busy ? 'Starting…' : 'Start snag fix (in progress)'}</button>
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
      <button onClick={() => setOpen(true)} className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition flex items-center justify-center gap-1.5">
        <Calendar size={15} /> Schedule job
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { setOpen(false); setPendingIso(null) }}>
          <div className="bg-[var(--surface-2)] ring-1 ring-[var(--border)] rounded-2xl p-5 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-[var(--text)]">Schedule the job</p>
            {pendingIso ? (
              <div className="space-y-2">
                <p className="text-sm text-[var(--text)]">No technician is assigned for this job. Schedule without one?</p>
                {err && <p className="text-xs text-red-500">{err}</p>}
                <div className="flex gap-2">
                  <button onClick={() => doSchedule(pendingIso)} disabled={busy} className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-500 disabled:opacity-50">{busy ? 'Scheduling…' : 'Yes, schedule'}</button>
                  <button onClick={() => setPendingIso(null)} disabled={busy} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm disabled:opacity-50">Back</button>
                </div>
              </div>
            ) : (
              <>
                {/* Assign a technician (from your roster) */}
                <div>
                  <label className="block text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Technician</label>
                  {technicians.length ? (
                    <select value={techId} onChange={e => setTechId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm outline-none focus:ring-[#C6A35D]/40">
                      <option value="">— Unassigned —</option>
                      {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  ) : (
                    <p className="text-xs text-[var(--text-muted)]">No technicians yet — add them under the <span className="text-[#C6A35D]">Technicians</span> tab.</p>
                  )}
                </div>
                {err && <p className="text-xs text-red-500">{err}</p>}
                <SchedulePicker priority={priority} createdAt={createdAt} busy={busy} onConfirm={confirm} onCancel={() => setOpen(false)} />
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
