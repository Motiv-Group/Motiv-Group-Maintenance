import { SkeletonList, Skeleton } from '@/components/ui/Skeleton'

export default function ExecutiveLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <SkeletonList rows={5} />
    </div>
  )
}
