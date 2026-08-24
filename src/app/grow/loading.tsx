import { AppShell } from "@/components/AppShell";
import {
  SkeletonAnnounce,
  SkeletonBlock,
  SkeletonCard,
  SkeletonChart,
} from "@/components/Skeleton";

/** Grow skeleton: intro, calculator with chart, refinance + raise cards. */
export default function GrowLoading() {
  return (
    <AppShell active="grow">
      <div className="mx-auto max-w-screen-2xl space-y-4 px-6 pt-6 2xl:px-10">
        <SkeletonAnnounce what="calculators" />

        <div>
          <SkeletonBlock className="h-5 w-56" />
          <SkeletonBlock className="mt-2 h-3 w-full max-w-lg" />
        </div>

        <SkeletonCard>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 3 }, (_, i) => (
              <SkeletonBlock key={i} className="h-8 w-28" />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i}>
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="mt-1 h-8 w-full" />
              </div>
            ))}
          </div>
          <SkeletonBlock className="mt-4 h-64 w-full" />
        </SkeletonCard>

        <SkeletonChart height="h-40" />

        <SkeletonCard>
          <SkeletonBlock className="h-4 w-48" />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonBlock key={i} className="h-9 w-full" />
            ))}
          </div>
          <SkeletonBlock className="mt-3 h-16 w-full" />
        </SkeletonCard>
      </div>
    </AppShell>
  );
}
