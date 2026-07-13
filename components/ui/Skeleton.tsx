import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700', className)} />
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('bg-white dark:bg-gray-800 border border-[var(--border)] dark:border-gray-700 rounded-xl p-4 space-y-3', className)}>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-3 w-1/3" />
    </div>
  )
}

export function SkeletonStatGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-gray-800 border border-[var(--border)] dark:border-gray-700 rounded-xl p-4 flex items-center gap-3">
          <Skeleton className="h-6 w-6 rounded-md shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-10" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

export function SkeletonStackedDeck() {
  return (
    <div className="relative mb-4">
      <div className="absolute rounded-xl bg-gray-300 dark:bg-gray-600" style={{ left: '14px', right: '14px', top: 0, bottom: '-10px', zIndex: 0 }} />
      <div className="absolute rounded-xl bg-gray-200 dark:bg-gray-700" style={{ left: '7px', right: '7px', top: 0, bottom: '-5px', zIndex: 1 }} />
      <div className="relative bg-white dark:bg-gray-800 border border-[var(--border)] dark:border-gray-700 rounded-xl p-4 space-y-3" style={{ zIndex: 2 }}>
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  )
}
