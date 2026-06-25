// RM ticket progress — SM-style stepper (dots + connectors + labels), out of the
// description block. Stage labels + colours match the ticket status badge
// (rmStatusMeta), so the bar and the badge always agree. Pure/server-safe.

const STAGES = [
  { label: 'Open',              dot: 'bg-blue-500',    ring: 'ring-blue-500/30',    text: 'text-blue-600 dark:text-blue-400' },
  { label: 'Quote requested',   dot: 'bg-cyan-500',    ring: 'ring-cyan-500/30',    text: 'text-cyan-600 dark:text-cyan-400' },
  { label: 'Quoted',            dot: 'bg-violet-500',  ring: 'ring-violet-500/30',  text: 'text-violet-600 dark:text-violet-400' },
  { label: 'Approved',          dot: 'bg-teal-500',    ring: 'ring-teal-500/30',    text: 'text-teal-600 dark:text-teal-400' },
  { label: 'In progress',       dot: 'bg-[#C6A35D]',   ring: 'ring-[#C6A35D]/30',   text: 'text-amber-600 dark:text-[#C6A35D]' },
  { label: 'Awaiting sign-off', dot: 'bg-orange-500',  ring: 'ring-orange-500/30',  text: 'text-orange-600 dark:text-orange-400' },
  { label: 'Completed',         dot: 'bg-emerald-500', ring: 'ring-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400' },
] as const

const IDX: Record<string, number> = {
  open: 0, info_requested: 0,
  assigned: 1, quote_requested: 1, assessment: 1,
  quoted: 2, quote_revision: 2,
  accepted: 3,
  scheduled: 4, in_progress: 4, variation_review: 4, variation_accepted: 4,
  submitted_for_signoff: 5, evidence_requested: 5, snag: 5, snag_assigned: 5, snag_resolved: 5, approved_closeout: 5, pending_sign_off: 5, snag_in_progress: 5,
  completed: 6,
}
export function RmPipeline({ status }: { status: string }) {
  if (status === 'cancelled' || status === 'declined') {
    return <p className="text-sm font-semibold text-red-600 dark:text-red-400">This ticket is {status === 'declined' ? 'declined' : 'cancelled'}.</p>
  }
  const idx = IDX[status] ?? 0

  return (
    <div>
      <div className="flex items-start">
        {STAGES.map((s, i) => {
          const reached = i <= idx
          const isLast = i === STAGES.length - 1
          return (
            <div key={s.label} className={isLast ? 'flex items-start' : 'flex items-start flex-1'}>
              <div className="flex flex-col items-center gap-1 w-12 sm:w-16">
                <div className={`w-3.5 h-3.5 rounded-full transition ${reached ? s.dot : 'bg-white/10'} ${i === idx ? `ring-4 ${s.ring}` : ''}`} />
                <span className={`text-[9px] text-center leading-tight ${i === idx ? `${s.text} font-semibold` : reached ? 'text-[var(--text-muted)]' : 'text-[var(--text-faint)]'}`}>{s.label}</span>
              </div>
              {!isLast && <div className={`flex-1 h-0.5 mt-[7px] rounded ${i < idx ? s.dot : 'bg-white/10'}`} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
