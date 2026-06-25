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

export function ScheduleJobCard({ ticketId, priority, createdAt }: { ticketId: string; priority: string; createdAt: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function confirm(iso: string) {
    setBusy(true); setErr('')
    try { await transition(ticketId, { action: 'schedule', scheduledAt: iso }); router.refresh() }
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
            {err && <p className="text-xs text-red-500">{err}</p>}
            <SchedulePicker priority={priority} createdAt={createdAt} busy={busy} onConfirm={confirm} onCancel={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
