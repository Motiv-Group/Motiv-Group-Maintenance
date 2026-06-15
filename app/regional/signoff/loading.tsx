import { SkeletonList, Skeleton } from '@/components/ui/Skeleton'

export default function RegionalSignoffLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-40" />
      <SkeletonList rows={3} />
    </div>
  )
}
