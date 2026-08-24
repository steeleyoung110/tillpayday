import { AppShell } from "@/components/AppShell";
import {
  SkeletonAnnounce,
  SkeletonBlock,
  SkeletonCard,
} from "@/components/Skeleton";

/** Year Wrapped skeleton: year picker, totals, month bars, interest ledger. */
export default function YearWrappedLoading() {
  return (
    <AppShell active="budget">
      <div className="mx-auto max-w-4xl space-y-6 px-6 pt-6">
        <SkeletonAnnounce what="year in review" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonBlock key={i} className="h-8 w-16" />
          ))}
        </div>
        <SkeletonCard className="p-6">
          <SkeletonBlock className="h-3 w-40" />
          <SkeletonBlock className="mt-2 h-8 w-24" />
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <SkeletonCard key={i} className="p-4">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="mt-2 h-6 w-24" />
              </SkeletonCard>
            ))}
          </div>
          <div className="mt-6 flex h-32 items-end gap-1.5">
            {Array.from({ length: 12 }, (_, i) => (
              <SkeletonBlock
                key={i}
                className="flex-1"
                /* varied heights so it reads as a chart, not a bar of blocks */
              />
            ))}
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SkeletonBlock className="h-20 w-full" />
            <SkeletonBlock className="h-20 w-full" />
          </div>
        </SkeletonCard>
      </div>
    </AppShell>
  );
}
