// Visual lifecycle stepper. Pure/server-safe (no hooks). Highlights the group
// the current status belongs to, mirroring the flowchart phases.
import { STATUS_META, type TicketStatus, type StatusGroup } from '@/lib/workflow'

const GROUPS: { key: StatusGroup; label: string }[] = [
  { key: 'intake',     label: 'Intake' },
  { key: 'commercial', label: 'Quote' },
  { key: 'execution',  label: 'Work' },
  { key: 'closeout',   label: 'Sign-off' },
  { key: 'closed',     label: 'Closed' },
]
const ORDER: StatusGroup[] = GROUPS.map(g => g.key)

const TONE: Record<string, string> = {
  blue: 'bg-blue-500', cyan: 'bg-cyan-500', teal: 'bg-teal-500', amber: 'bg-amber-500',
  purple: 'bg-purple-500', indigo: 'bg-indigo-500', orange: 'bg-orange-500', red: 'bg-red-500',
  pink: 'bg-pink-500', green: 'bg-emerald-500', gray: 'bg-gray-500', slate: 'bg-slate-500',
}

export function StatusPipeline({ status }: { status: string }) {
  const meta = STATUS_META[status as TicketStatus]
  const activeIdx = meta ? ORDER.indexOf(meta.group) : -1
  const isClosed = meta?.group === 'closed'
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${TONE[meta?.tone ?? 'slate']}`} />
        <span className="text-sm font-semibold text-white">{meta?.label ?? status}</span>
      </div>
      <div className="flex items-center gap-1">
        {GROUPS.map((g, i) => {
          const done = activeIdx >= 0 && i < activeIdx
          const active = i === activeIdx
          const cancelled = isClosed && (status === 'cancelled' || status === 'declined')
          return (
            <div key={g.key} className="flex-1">
              <div className={`h-1.5 rounded-full ${active ? (cancelled ? 'bg-gray-500' : 'bg-[#C6A35D]') : done ? 'bg-[#C6A35D]/50' : 'bg-white/10'}`} />
              <div className={`text-[10px] mt-1 text-center ${active ? 'text-[#C6A35D]' : 'text-[var(--text-faint)]'}`}>{g.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
