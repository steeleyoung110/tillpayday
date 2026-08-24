import { AppShell } from "@/components/AppShell";
import {
  SkeletonAnnounce,
  SkeletonBlock,
  SkeletonCard,
  SkeletonChart,
  SkeletonTile,
} from "@/components/Skeleton";

/** Dashboard skeleton: hero + payday preview, score, insight tiles, charts. */
export default function DashboardLoading() {
  return (
    <AppShell active="dashboard">
      <div className="mx-auto max-w-screen-2xl space-y-6 px-6 pt-6 2xl:px-10">
        <SkeletonAnnounce what="dashboard" />

        {/* Safe-to-spend hero + next-payday preview */}
        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
          <SkeletonCard className="px-6 py-6">
            <div className="flex justify-between">
              <SkeletonBlock className="h-3 w-32" />
              <SkeletonBlock className="h-6 w-40" />
            </div>
            <SkeletonBlock className="mt-3 h-16 w-64" />
            <SkeletonBlock className="mt-3 h-5 w-56" />
            <SkeletonBlock className="mt-2 h-3 w-full max-w-md" />
          </SkeletonCard>
          <SkeletonCard className="px-6 py-5">
            <div className="flex justify-between">
              <SkeletonBlock className="h-4 w-44" />
              <SkeletonBlock className="h-4 w-24" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {Array.from({ length: 4 }, (_, i) => (
                <SkeletonBlock key={i} className="h-6 w-24" />
              ))}
            </div>
            <SkeletonBlock className="mt-3 h-4 w-full" />
          </SkeletonCard>
        </div>

        {/* Can-I-afford-it */}
        <SkeletonCard className="px-6 py-5">
          <SkeletonBlock className="h-6 w-64" />
        </SkeletonCard>

        {/* Budget health score */}
        <SkeletonCard className="px-6 py-5">
          <div className="flex justify-between">
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-8 w-20" />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <SkeletonCard key={i} className="p-2.5">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="mt-1.5 h-1.5 w-full" />
                <SkeletonBlock className="mt-1.5 h-3 w-10" />
              </SkeletonCard>
            ))}
          </div>
        </SkeletonCard>

        {/* Insight tiles */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonCard key={i} className="px-6 py-5">
              <SkeletonBlock className="h-3 w-28" />
              <SkeletonBlock className="mt-2 h-9 w-32" />
              <SkeletonBlock className="mt-2 h-3 w-full" />
            </SkeletonCard>
          ))}
        </div>

        {/* Log a spend */}
        <SkeletonCard className="px-6 py-4">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-2 h-9 w-full" />
        </SkeletonCard>

        {/* Projection: tiles then the two charts */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonTile key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      </div>
    </AppShell>
  );
}
