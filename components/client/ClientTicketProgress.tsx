// Horizontal progress stepper for the store-manager ticket view. Collapses the
// full lifecycle to New → Scheduled → In Progress → Completed
// (clientVisibleStatus) — deliberately no quote/sign-off steps. Pure/server-safe.
import { FileText, CalendarClock, Wrench, CheckCircle2, Check } from 'lucide-react'
import { clientVisibleStatus } from '@/lib/utils'
import type { TicketStatus } from '@/lib/types'
import type { LucideIcon } from 'lucide-react'

const STEPS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'open',        label: 'New',         Icon: FileText },
  { key: 'scheduled',   label: 'Scheduled',   Icon: CalendarClock },
  { key: 'in_progress', label: 'In Progress', Icon: Wrench },
  { key: 'completed',   label: 'Completed',   Icon: CheckCircle2 },
]

export function ClientTicketProgress({ status }: { status: string }) {
  const cv = clientVisibleStatus(status as TicketStatus)
  if (cv === null || cv === 'cancelled') {
    return <p className="text-center text-sm text-[var(--text-faint)]">This ticket was cancelled.</p>
  }
  const idx = cv === 'completed' ? 3 : cv === 'in_progress' ? 2 : cv === 'scheduled' ? 1 : 0

  return (
    <ol className="flex px-1">
      {STEPS.map((s, i) => {
        const done = i < idx
        const current = i === idx
        const reached = i <= idx
        // Opaque circle bg so the connector line sits behind, not through it.
        const circle = reached
          ? 'border-blue-600 bg-blue-600 text-white'
          : 'border-[var(--text-faint)] bg-[var(--surface)] text-[var(--text-muted)]'
        const Icon = done ? Check : s.Icon
        return (
          <li key={s.key} className="relative flex-1 flex flex-col items-center">
            {i > 0 && (
              <span aria-hidden className={`absolute top-4 right-1/2 h-0.5 w-full ${i <= idx ? 'bg-blue-600' : 'bg-[var(--border)]'}`} />
            )}
            <span
              aria-current={current ? 'step' : undefined}
              className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 ${circle} ${current ? 'ring-4 ring-blue-500/25' : ''}`}
            >
              <Icon size={15} />
            </span>
            <span className={`mt-2 text-xs text-center ${current ? 'font-bold text-[var(--text)]' : reached ? 'font-medium text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>{s.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
