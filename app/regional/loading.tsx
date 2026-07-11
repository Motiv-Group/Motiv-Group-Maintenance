import { SkeletonStatGrid, SkeletonStackedDeck, SkeletonList, Skeleton } from '@/components/ui/Skeleton'

export default function RegionalDashboardLoading() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <SkeletonStatGrid />
      {/* Progress bar */}
      <div className="bg-white dark:bg-gray-800 border border-[var(--border)] dark:border-gray-700 rounded-xl p-4 space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="flex gap-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <Skeleton className="h-5 w-36" />
          <SkeletonStackedDeck />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-36" />
          <SkeletonList rows={3} />
        </div>
      </div>
    </div>
  )
}
