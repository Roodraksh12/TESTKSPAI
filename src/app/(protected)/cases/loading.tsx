import { CardSkeleton } from "@/components/scrb/primitives"

export default function CasesLoading() {
  return (
    <div className="flex h-full flex-col gap-6 p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="space-y-1">
        <div className="h-8 w-56 bg-muted rounded animate-pulse" />
        <div className="h-4 w-72 bg-muted rounded animate-pulse" />
      </div>

      <div className="h-14 rounded-xl bg-muted animate-pulse" />

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
