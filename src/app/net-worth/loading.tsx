import { AppShell } from "@/components/AppShell";
import {
  SkeletonAnnounce,
  SkeletonBlock,
  SkeletonCard,
  SkeletonChart,
  SkeletonPanel,
} from "@/components/Skeleton";

/** Net worth skeleton: totals, freedom/forecast pair, chart, item lists. */
export default function NetWorthLoading() {
  return (
    <AppShell active="networth">
      <div className="mx-auto max-w-screen-2xl space-y-6 px-6 pt-6 2xl:px-10">
        <SkeletonAnnounce what="net worth" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonCard key={i} className="px-6 py-5">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="mt-2 h-8 w-32" />
            </SkeletonCard>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SkeletonCard>
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="mt-3 h-10 w-24" />
            <SkeletonBlock className="mt-2 h-2.5 w-full" />
            <SkeletonBlock className="mt-3 h-3 w-full" />
          </SkeletonCard>
          <SkeletonCard>
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="mt-3 h-3 w-full" />
            <div className="mt-3 space-y-2">
              <SkeletonBlock className="h-9 w-full" />
              <SkeletonBlock className="h-9 w-full" />
            </div>
          </SkeletonCard>
        </div>

        <SkeletonChart height="h-72" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SkeletonPanel lines={5} />
          <SkeletonPanel lines={5} />
        </div>
      </div>
    </AppShell>
  );
}
