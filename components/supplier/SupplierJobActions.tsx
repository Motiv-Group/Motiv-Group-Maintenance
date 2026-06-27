'use client'

// Supplier "Schedule job" action — a green button that opens a themed calendar
// (date + 1-hour time slot, capped by the ticket priority window and operating
// hours). The Submit COC & POC flow lives on its own page (/complete).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar } from 'lucide-react'
import { SchedulePicker } from '@/components/ui/SchedulePicker'

async function transition(ticketId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/tickets/${ticketId}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Something went wrong')
}

// Raise a variation order — full-width amber button matching the COC/POC button.
export function RaiseVariationCard({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)]'

  async function submit() {
    setBusy(true); setErr('')
    try { await transition(ticketId, { action: 'submit_variation', description: desc.trim(), amount: amount ? Number(amount) : undefined }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-[#0a0e17] text-sm font-semibold transition">Raise Variation</button>
  }

  return (
    <div className="rounded-xl ring-1 ring-[var(--border)] p-4 space-y-2">
      <p className="text-sm font-semibold text-[var(--text)]">Raise a variation order</p>
      <p className="text-xs text-[var(--text-muted)]">Extra materials or work needed to finish — sent to the manager for approval before work continues.</p>
      <textarea className={`${input} min-h-[80px]`} placeholder="What changed / extra scope needed" value={desc} onChange={e => setDesc(e.target.value)} />
      <input className={input} type="number" inputMode="decimal" placeholder="Extra cost (R) — optional" value={amount} onChange={e => setAmount(e.target.value)} />
      {err && <p className="text-xs text-red-500">{err}</p>}
      {confirming ? (
        <div className="space-y-2">
          <p className="text-sm text-[var(--text)]">Submit this variation order to the manager?</p>
          <div className="flex gap-2">
            <button onClick={submit} disabled={busy} className="flex-1 py-2 rounded-lg bg-amber-500 text-[#0a0e17] text-sm font-semibold disabled:opacity-50">{busy ? 'Submitting…' : 'Yes, submit'}</button>
            <button onClick={() => setConfirming(false)} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Back</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => { if (!desc.trim()) { setErr('Describe the extra scope.'); return } setErr(''); setConfirming(true) }} className="flex-1 py-2 rounded-lg bg-amber-500 text-[#0a0e17] text-sm font-semibold">Raise Variation</button>
          <button onClick={() => setOpen(false)} className="flex-1 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Cancel</button>
        </div>
      )}
    </div>
  )
}

export function ScheduleJobCard({ ticketId, priority, createdAt, technicians = [] }: { ticketId: string; priority: string; createdAt: string; technicians?: { id: string; name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [techId, setTechId] = useState('')

  async function confirm(iso: string) {
    // Date + time are enforced by the picker; the technician is optional — just confirm if left unassigned.
    if (!techId && !window.confirm('No technician is assigned for this job. Schedule without a technician?')) return
    setBusy(true); setErr('')
    try { await transition(ticketId, { action: 'schedule', scheduledAt: iso, technicianId: techId || null }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition flex items-center justify-center gap-1.5">
        <Calendar size={15} /> Schedule job
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-[var(--surface-2)] ring-1 ring-[var(--border)] rounded-2xl p-5 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-[var(--text)]">Schedule the job</p>
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
          </div>
        </div>
      )}
    </>
  )
}
