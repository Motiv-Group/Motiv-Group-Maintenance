// Instant skeleton for the store-detail route. Without it, clicking a store row
// on a `force-dynamic` page shows NOTHING until the server render finishes (the
// old page just freezes). This shell also lets the row's <Link> prefetch land
// here, so navigation feels immediate.
import { Card } from '@/components/exec/ui'

function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[var(--surface-2)] ${className}`} />
}

export default function Loading() {
  return (
    <div className="space-y-4">
      <Bar className="h-3 w-40" />

      {/* Summary card */}
      <Card className="p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-2">
            <Bar className="h-5 w-48" />
            <Bar className="h-3 w-32" />
            <Bar className="h-2.5 w-40" />
          </div>
          <Bar className="h-5 w-20 rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between"><Bar className="h-3 w-24" /><Bar className="h-5 w-12" /></div>
          <div className="flex gap-1">{Array.from({ length: 4 }).map((_, i) => <Bar key={i} className="h-2.5 flex-1 rounded-full" />)}</div>
        </div>
      </Card>

      {/* Milestones */}
      <Card className="p-4 sm:p-5 space-y-4">
        <Bar className="h-4 w-24" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bar className="h-6 w-6 shrink-0 rounded-full" />
            <div className="flex flex-1 items-center justify-between"><Bar className="h-3.5 w-28" /><Bar className="h-3 w-20" /></div>
          </div>
        ))}
      </Card>

      {/* Galleries */}
      <Card className="p-4 sm:p-5 space-y-3">
        <Bar className="h-4 w-28" />
        <div className="flex gap-2">{Array.from({ length: 4 }).map((_, i) => <Bar key={i} className="h-20 w-20 sm:h-24 sm:w-24" />)}</div>
      </Card>
    </div>
  )
}
