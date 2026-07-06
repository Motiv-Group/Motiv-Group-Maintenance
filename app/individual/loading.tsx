import { SkeletonList, Skeleton } from '@/components/ui/Skeleton'

export default function IndividualLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <SkeletonList rows={4} />
    </div>
  )
}
