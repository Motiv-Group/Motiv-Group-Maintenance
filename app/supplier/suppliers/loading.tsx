import { SkeletonList, Skeleton } from '@/components/ui/Skeleton'

export default function SuppliersLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <SkeletonList rows={6} />
    </div>
  )
}
