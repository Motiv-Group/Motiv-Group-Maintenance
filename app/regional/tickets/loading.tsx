import { SkeletonList, Skeleton } from '@/components/ui/Skeleton'

export default function RegionalTicketsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-32" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <SkeletonList rows={6} />
    </div>
  )
}
