import { AppShell } from "@/components/AppShell";
import {
  SkeletonAnnounce,
  SkeletonBlock,
  SkeletonCard,
  SkeletonChart,
  SkeletonPanel,
} from "@/components/Skeleton";

/** Portfolio skeleton: header + year pills, equity strip, stat cards, chart. */
export default function PortfolioLoading() {
  return (
    <AppShell active="dashboard">
      <div className="mx-auto max-w-screen-2xl space-y-6 px-6 pt-6 2xl:px-10">
        <SkeletonAnnounce what="properties" />

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SkeletonBlock className="h-7 w-44" />
            <SkeletonBlock className="mt-2 h-3 w-56" />
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 3 }, (_, i) => (
              <SkeletonBlock key={i} className="h-7 w-14 rounded-full" />
            ))}
          </div>
        </div>

        {/* Equity strip */}
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonCard key={i} className="p-4">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="mt-2 h-7 w-28" />
            </SkeletonCard>
          ))}
        </div>

        {/* Year stat cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonCard key={i} className="p-4">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="mt-2 h-7 w-28" />
              <SkeletonBlock className="mt-2 h-3 w-full" />
            </SkeletonCard>
          ))}
        </div>

        <SkeletonChart height="h-72" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SkeletonPanel lines={5} />
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <SkeletonPanel key={i} lines={1} />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
