import { SkeletonStatGrid, SkeletonStackedDeck, Skeleton } from '@/components/ui/Skeleton'

export default function SupplierDashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>
      <SkeletonStatGrid />
      <div className="bg-[var(--surface)] ring-1 ring-black/10 dark:ring-white/10 rounded-2xl p-4 space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="flex gap-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-36" />
        <SkeletonStackedDeck />
      </div>
    </div>
  )
}
