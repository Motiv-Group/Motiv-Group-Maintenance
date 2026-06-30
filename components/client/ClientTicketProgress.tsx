// 3-step progress dots for the store-manager ticket view. Collapses the full
// lifecycle to Open → In Progress → Completed (clientVisibleStatus) and colours
// each reached dot in its status colour. Pure/server-safe.
import { clientVisibleStatus } from '@/lib/utils'
import type { TicketStatus } from '@/lib/types'

const STEPS = [
  { label: 'Open',          dot: 'bg-blue-500',    ring: 'ring-blue-500/30',    text: 'text-blue-600 dark:text-blue-400' },
  { label: 'Job scheduled', dot: 'bg-indigo-500',  ring: 'ring-indigo-500/30',  text: 'text-indigo-600 dark:text-indigo-400' },
  { label: 'In Progress',   dot: 'bg-[#C6A35D]',   ring: 'ring-[#C6A35D]/30',   text: 'text-amber-600 dark:text-[#C6A35D]' },
  { label: 'Completed',     dot: 'bg-emerald-500', ring: 'ring-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400' },
] as const

export function ClientTicketProgress({ status }: { status: string }) {
  const cv = clientVisibleStatus(status as TicketStatus)
  if (cv === null || cv === 'cancelled') {
    return <p className="text-center text-sm text-[var(--text-faint)]">This ticket was cancelled.</p>
  }
  const idx = cv === 'completed' ? 3 : cv === 'in_progress' ? 2 : cv === 'scheduled' ? 1 : 0

  return (
    <div className="flex items-start px-1">
      {STEPS.map((s, i) => {
        const reached = i <= idx
        return (
          <div key={s.label} className={i < STEPS.length - 1 ? 'flex items-start flex-1' : 'flex items-start'}>
            <div className="flex flex-col items-center gap-1.5 w-20">
              <div className={`w-4 h-4 rounded-full transition ${reached ? s.dot : 'bg-black/15 dark:bg-white/10'} ${i === idx ? `ring-4 ${s.ring}` : ''}`} />
              <span className={`text-[11px] font-medium ${reached ? s.text : 'text-[var(--text-faint)]'}`}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mt-[7px] rounded ${i < idx ? STEPS[i].dot : 'bg-black/15 dark:bg-white/10'}`} />}
          </div>
        )
      })}
    </div>
  )
}
