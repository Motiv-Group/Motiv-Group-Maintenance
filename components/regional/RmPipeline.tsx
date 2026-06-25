// RM ticket progress — 8-stage pipeline mapped from the underlying engine
// statuses, with a snag/variation branch chip. Pure/server-safe (no hooks).
import type { TicketStatus } from '@/lib/types'

const STAGES = [
  'Open', 'Supplier assigned', 'Quoted', 'Awaiting approval',
  'Approved', 'In progress', 'Awaiting sign-off', 'Completed',
] as const

// Map an engine status to the furthest stage index reached.
const STAGE_IDX: Record<string, number> = {
  open: 0, info_requested: 0,
  assigned: 1, assessment: 1, quote_requested: 1,
  quoted: 3, quote_revision: 3,            // quote received → awaiting RM approval
  accepted: 4,
  scheduled: 5, in_progress: 5, variation_review: 5,
  submitted_for_signoff: 6, evidence_requested: 6,
  snag: 6, snag_assigned: 6, snag_resolved: 6, approved_closeout: 6,
  completed: 7, pending_sign_off: 6, snag_in_progress: 6, variation_accepted: 5,
}

const BRANCH: Record<string, string> = {
  snag: 'Snag', snag_assigned: 'Snag', snag_resolved: 'Snag', snag_in_progress: 'Snag',
  variation_review: 'Variation', variation_accepted: 'Variation',
}

export function RmPipeline({ status }: { status: string }) {
  const closed = status === 'cancelled' || status === 'declined'
  if (closed) {
    return <p className="text-sm font-semibold text-[var(--text-muted)]">This ticket is {status === 'declined' ? 'declined' : 'cancelled'}.</p>
  }
  const idx = STAGE_IDX[status as TicketStatus] ?? 0
  const branch = BRANCH[status]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--text)]">{STAGES[idx]}</span>
        {branch && <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 bg-amber-500/15 rounded-full px-2 py-0.5">{branch}</span>}
      </div>
      <div className="flex items-start gap-1 overflow-x-auto -mx-1 px-1">
        {STAGES.map((label, i) => {
          const reached = i <= idx
          const active = i === idx
          return (
            <div key={label} className="flex flex-col items-center gap-1 min-w-[64px] flex-1">
              <div className="flex items-center w-full">
                <div className={`h-1.5 flex-1 rounded-full ${i === 0 ? 'opacity-0' : i <= idx ? 'bg-[#C6A35D]' : 'bg-white/10'}`} />
                <div className={`w-3 h-3 rounded-full shrink-0 ${reached ? 'bg-[#C6A35D]' : 'bg-white/10'} ${active ? 'ring-4 ring-[#C6A35D]/30' : ''}`} />
                <div className={`h-1.5 flex-1 rounded-full ${i === STAGES.length - 1 ? 'opacity-0' : i < idx ? 'bg-[#C6A35D]' : 'bg-white/10'}`} />
              </div>
              <span className={`text-[9px] text-center leading-tight ${active ? 'text-[#C6A35D] font-semibold' : reached ? 'text-[var(--text-muted)]' : 'text-[var(--text-faint)]'}`}>{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
