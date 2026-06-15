import { SkeletonStatGrid, Skeleton } from '@/components/ui/Skeleton'

export default function AdminStatsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-24" />
      <SkeletonStatGrid />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  )
}
