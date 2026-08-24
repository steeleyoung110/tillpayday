import { AppShell } from "@/components/AppShell";
import {
  SkeletonAnnounce,
  SkeletonBlock,
  SkeletonCard,
  SkeletonPanel,
} from "@/components/Skeleton";

/** Crisis-mode skeleton: header, the three runway tiles, the pause list. */
export default function CrisisLoading() {
  return (
    <AppShell active="dashboard">
      <div className="mx-auto max-w-4xl space-y-6 px-6 pt-6">
        <SkeletonAnnounce what="worst-case plan" />
        <div>
          <SkeletonBlock className="h-7 w-72" />
          <SkeletonBlock className="mt-2 h-3 w-full max-w-lg" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonCard key={i} className="p-5">
              <SkeletonBlock className="h-3 w-28" />
              <SkeletonBlock className="mt-2 h-8 w-24" />
              <SkeletonBlock className="mt-2 h-3 w-full" />
            </SkeletonCard>
          ))}
        </div>
        <SkeletonPanel lines={4} />
      </div>
    </AppShell>
  );
}
