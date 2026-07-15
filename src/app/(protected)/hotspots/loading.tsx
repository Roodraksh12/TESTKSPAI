import { StatSkeleton } from "@/components/scrb/primitives"

export default function HotspotsLoading() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr] p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="bg-surface border border-hairline rounded-2xl p-6 h-[calc(100vh-10rem)] space-y-4">
        <div className="h-3 w-24 bg-muted rounded animate-pulse" />
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        <div className="h-4 w-64 bg-muted rounded animate-pulse" />
        <div className="flex-1 bg-muted rounded-2xl animate-pulse mt-4 h-[70%]" />
      </div>
      <div className="space-y-6">
        <StatSkeleton />
        <StatSkeleton />
      </div>
    </div>
  )
}
