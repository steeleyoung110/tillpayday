import { AppShell } from "@/components/AppShell";
import {
  SkeletonAnnounce,
  SkeletonBlock,
  SkeletonCard,
  SkeletonPanel,
  SkeletonTiles,
} from "@/components/Skeleton";

/** Budget skeleton: header, cycle tiles, check coverage, calendar, panels. */
export default function BudgetLoading() {
  return (
    <AppShell active="budget">
      <div className="mx-auto max-w-screen-2xl space-y-6 px-6 pt-6 2xl:px-10">
        <SkeletonAnnounce what="budget" />

        <div>
          <SkeletonBlock className="h-5 w-36" />
          <SkeletonBlock className="mt-2 h-3 w-full max-w-lg" />
          <div className="mt-2 flex flex-wrap gap-4">
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonBlock key={i} className="h-3 w-16" />
            ))}
          </div>
        </div>

        <SkeletonTiles />

        {/* Which check covers what */}
        <SkeletonCard>
          <SkeletonBlock className="h-4 w-48" />
          <SkeletonBlock className="mt-2 h-3 w-full max-w-xl" />
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonCard key={i} className="p-3">
                <div className="flex justify-between">
                  <SkeletonBlock className="h-4 w-20" />
                  <SkeletonBlock className="h-3 w-14" />
                </div>
                <SkeletonBlock className="mt-3 h-3 w-full" />
                <SkeletonBlock className="mt-1.5 h-3 w-3/4" />
              </SkeletonCard>
            ))}
          </div>
        </SkeletonCard>

        {/* Money calendar */}
        <SkeletonCard>
          <div className="flex justify-between">
            <SkeletonBlock className="h-4 w-56" />
            <SkeletonBlock className="h-6 w-20" />
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, i) => (
              <SkeletonBlock key={i} className="h-16 w-full" />
            ))}
          </div>
        </SkeletonCard>

        {/* Where each paycheck goes: two pies */}
        <SkeletonCard>
          <SkeletonBlock className="h-4 w-52" />
          <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-2">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex flex-wrap items-center gap-6">
                <SkeletonBlock className="h-40 w-40 rounded-full" />
                <div className="min-w-44 flex-1 space-y-2">
                  {Array.from({ length: 4 }, (_, j) => (
                    <SkeletonBlock key={j} className="h-4 w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SkeletonCard>

        {/* Management panels */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonPanel key={i} lines={4} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
