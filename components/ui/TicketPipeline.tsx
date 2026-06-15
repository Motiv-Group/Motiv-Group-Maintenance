import type { TicketStatus } from '@/lib/types'

const PIPELINE: { status: TicketStatus | 'open'; label: string }[] = [
  { status: 'open',        label: 'Open' },
  { status: 'quoted',      label: 'Quoted' },
  { status: 'accepted',    label: 'Approved' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'completed',   label: 'Complete' },
]

function stepIndex(status: TicketStatus): number {
  const map: Record<string, number> = {
    open:        0,
    quoted:      1,
    accepted:    2,
    in_progress: 3,
    completed:   4,
  }
  return map[status] ?? -1
}

interface Props {
  status: TicketStatus
}

export function TicketPipeline({ status }: Props) {
  // Declined / cancelled — show a simple badge instead of pipeline
  if (status === 'declined' || status === 'cancelled') {
    return (
      <div className="flex items-center gap-1.5 mt-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          status === 'declined'
            ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
        }`}>
          {status === 'declined' ? 'Declined' : 'Cancelled'}
        </span>
      </div>
    )
  }

  const current = stepIndex(status)

  return (
    <div className="flex items-center gap-0 mt-2 w-full">
      {PIPELINE.map((step, i) => {
        const done    = i < current
        const active  = i === current
        const future  = i > current
        const isLast  = i === PIPELINE.length - 1

        return (
          <div key={step.status} className="flex items-center flex-1 min-w-0">
            {/* Step */}
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full border-2 transition-all ${
                done   ? 'bg-green-500 border-green-500' :
                active ? 'bg-brand-600 border-brand-600 ring-2 ring-brand-200 dark:ring-brand-900' :
                         'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
              }`} />
              <span className={`text-[9px] mt-0.5 font-medium leading-tight text-center whitespace-nowrap ${
                done   ? 'text-green-600 dark:text-green-400' :
                active ? 'text-brand-600 dark:text-brand-400' :
                         'text-gray-400 dark:text-gray-500'
              }`}>
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div className={`flex-1 h-0.5 mx-0.5 mb-3 rounded-full transition-all ${
                done ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'
              }`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
