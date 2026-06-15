import { SkeletonList, Skeleton } from '@/components/ui/Skeleton'

export default function RegionalStoresLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-10 w-full rounded-xl" />
      <SkeletonList rows={5} />
    </div>
  )
}
