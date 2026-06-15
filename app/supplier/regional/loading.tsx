import { SkeletonList, Skeleton } from '@/components/ui/Skeleton'

export default function AdminClientsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-10 w-full rounded-xl" />
      <SkeletonList rows={6} />
    </div>
  )
}
