import { SkeletonList, Skeleton } from '@/components/ui/Skeleton'

export default function RegionalSnagLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-24" />
      <SkeletonList rows={4} />
    </div>
  )
}
