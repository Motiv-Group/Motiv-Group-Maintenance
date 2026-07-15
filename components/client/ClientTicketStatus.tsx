// Plain-language status for the store manager — no quote/COC/sign-off jargon.
// Shows a spinner while the job is being handled, a tick when done.
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'

export type ClientStatusMode = 'wait' | 'spin' | 'done' | 'closed'
export interface ClientStatusMeta { msg: string; sub: string; mode: ClientStatusMode }

// Exported so the ticket-detail "Next action" card can reuse the exact same
// plain-language copy without re-rendering the whole status card.
export function clientStatusMeta(status: string): ClientStatusMeta {
  return MAP[status] ?? { msg: 'In progress', sub: 'Being handled.', mode: 'spin' }
}

type Mode = ClientStatusMode
type Meta = ClientStatusMeta

const MAP: Record<string, Meta> = {
  open:              { msg: 'Being processed',              sub: 'Your ticket has been received and is being processed. You will be notified once work begins.', mode: 'wait' },
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

export function ClientTicketStatus({ status, cancellationReason }: { status: string; cancellationReason?: string | null }) {
  const m = MAP[status] ?? { msg: 'In progress', sub: 'Being handled.', mode: 'spin' as Mode }
  const done = status === 'completed'
  const cancelled = status === 'cancelled'
  const closed = cancelled || status === 'declined'
  const active = !done && !closed   // everything in-flight spins, incl. "being processed"
  const isWait = m.mode === 'wait'  // logged / awaiting-review → blue tone
  const Icon = done ? CheckCircle2 : closed ? XCircle : Loader2
  // Self-contained card: blue while being processed, gold while underway,
  // emerald when complete, red when cancelled, faint when declined.
  const ring = done ? 'ring-emerald-500/40' : cancelled ? 'ring-red-500/40' : closed ? 'ring-[var(--border)]' : isWait ? 'ring-blue-500/40' : 'ring-[#f59e0b]/40'
  const iconColor = done ? 'text-emerald-400' : cancelled ? 'text-red-500' : closed ? 'text-[var(--text-faint)]' : isWait ? 'text-blue-500' : 'text-[#f59e0b]'
  const subColor = active && isWait ? 'text-blue-600/90 dark:text-blue-300/80' : 'text-[var(--text-muted)]'
  const sub = cancelled && cancellationReason ? cancellationReason : m.sub
  return (
    <div className={`rounded-2xl bg-[var(--surface)] ring-1 ${ring} p-5 flex items-center gap-4`}>
      {active
        ? <Loader2 size={26} className={`${iconColor} animate-spin shrink-0`} />
        : <Icon size={26} className={`${iconColor} shrink-0`} />}
      <div className="min-w-0">
        <p className="text-base font-bold text-[var(--text)]">{m.msg}</p>
        <p className={`text-sm mt-0.5 ${subColor}`}>{sub}</p>
      </div>
    </div>
  )
}
