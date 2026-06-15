import { SkeletonList, Skeleton } from '@/components/ui/Skeleton'

export default function AdminSnagLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-20" />
      <SkeletonList rows={4} />
    </div>
  )
}
