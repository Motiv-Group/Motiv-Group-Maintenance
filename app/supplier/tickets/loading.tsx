import { SkeletonList, Skeleton } from '@/components/ui/Skeleton'

export default function AdminTicketsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-24" />
      <div className="flex gap-2 flex-wrap">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <SkeletonList rows={7} />
    </div>
  )
}
