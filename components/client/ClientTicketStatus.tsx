// Plain-language status for the store manager — no quote/COC/sign-off jargon.
// Shows a spinner while the job is being handled, a tick when done.
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'

type Mode = 'wait' | 'spin' | 'done' | 'closed'
interface Meta { msg: string; sub: string; mode: Mode }

const MAP: Record<string, Meta> = {
  open:              { msg: 'Logged — awaiting review',     sub: "We've received your request.",            mode: 'wait' },
  info_requested:    { msg: 'We need a bit more info',      sub: 'Please update and resubmit below.',         mode: 'wait' },
  assigned:          { msg: 'Assigned to a team',           sub: 'Getting this organised for you.',           mode: 'spin' },
  assessment:        { msg: 'Being assessed',               sub: 'A technician is reviewing the issue.',      mode: 'spin' },
  quote_requested:   { msg: 'Being handled',                sub: 'Arranging the work — nothing needed from you.', mode: 'spin' },
  quoted:            { msg: 'Being handled',                sub: 'Arranging the work — nothing needed from you.', mode: 'spin' },
  quote_revision:    { msg: 'Being handled',                sub: 'Arranging the work — nothing needed from you.', mode: 'spin' },
  accepted:          { msg: 'Approved',                     sub: 'Scheduling the team now.',                  mode: 'spin' },
  scheduled:         { msg: 'Scheduled',                    sub: 'The team will arrive soon.',                mode: 'spin' },
  in_progress:       { msg: 'The team is on the way',       sub: 'Work is underway.',                         mode: 'spin' },
  variation_review:  { msg: 'The team is on the way',       sub: 'Work is underway.',                         mode: 'spin' },
  submitted_for_signoff: { msg: 'Wrapping up',              sub: 'Final checks and sign-off.',                mode: 'spin' },
  evidence_requested:{ msg: 'Wrapping up',                  sub: 'Final checks and sign-off.',                mode: 'spin' },
  snag:              { msg: 'Fixing a follow-up',           sub: 'A small issue is being put right.',         mode: 'spin' },
  snag_assigned:     { msg: 'Fixing a follow-up',           sub: 'A small issue is being put right.',         mode: 'spin' },
  snag_resolved:     { msg: 'Wrapping up',                  sub: 'Final checks and sign-off.',                mode: 'spin' },
  approved_closeout: { msg: 'Wrapping up',                  sub: 'Closing the job off.',                      mode: 'spin' },
  completed:         { msg: 'Completed',                    sub: 'This job is done.',                         mode: 'done' },
  cancelled:         { msg: 'Cancelled',                    sub: 'This ticket was cancelled.',                mode: 'closed' },
  declined:          { msg: 'Declined',                     sub: 'This request was declined.',                mode: 'closed' },
}

export function ClientTicketStatus({ status }: { status: string }) {
  const m = MAP[status] ?? { msg: 'In progress', sub: 'Being handled.', mode: 'spin' as Mode }
  const done = status === 'completed'
  const closed = status === 'cancelled' || status === 'declined'
  const active = !done && !closed   // everything in-flight spins, incl. "awaiting review"
  const Icon = done ? CheckCircle2 : closed ? XCircle : Loader2
  const color = done ? 'text-emerald-400' : closed ? 'text-[var(--text-faint)]' : 'text-[#C6A35D]'
  return (
    <div className="flex items-center gap-3">
      {active
        ? <span className="relative shrink-0 w-6 h-6"><Loader2 size={24} className="text-[#C6A35D] animate-spin" /></span>
        : <Icon size={22} className={`${color} shrink-0`} />}
      <div>
        <p className="text-sm font-semibold text-[var(--text)]">{m.msg}</p>
        <p className="text-xs text-[var(--text-muted)]">{m.sub}</p>
      </div>
    </div>
  )
}
