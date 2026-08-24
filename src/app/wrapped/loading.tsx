import { AppShell } from "@/components/AppShell";
import {
  SkeletonAnnounce,
  SkeletonBlock,
  SkeletonCard,
} from "@/components/Skeleton";

/** Wrapped skeleton: month picker, the three totals, the report card. */
export default function WrappedLoading() {
  return (
    <AppShell active="budget">
      <div className="mx-auto max-w-4xl space-y-6 px-6 pt-6">
        <SkeletonAnnounce what="report card" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonBlock key={i} className="h-8 w-20" />
          ))}
        </div>
        <SkeletonCard className="p-6">
          <SkeletonBlock className="h-3 w-40" />
          <SkeletonBlock className="mt-2 h-8 w-44" />
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <SkeletonCard key={i} className="p-4">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="mt-2 h-6 w-24" />
              </SkeletonCard>
            ))}
          </div>
          <div className="mt-6 space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonBlock key={i} className="h-9 w-full" />
            ))}
          </div>
        </SkeletonCard>
      </div>
    </AppShell>
  );
}
