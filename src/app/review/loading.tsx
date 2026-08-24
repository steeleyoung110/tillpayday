import { AppShell } from "@/components/AppShell";
import {
  SkeletonAnnounce,
  SkeletonBlock,
  SkeletonCard,
} from "@/components/Skeleton";

/** Weekly review skeleton: header + the three numbered steps + the button. */
export default function ReviewLoading() {
  return (
    <AppShell active="dashboard">
      <div className="mx-auto max-w-4xl space-y-6 px-6 pt-6">
        <SkeletonAnnounce what="weekly review" />
        <div className="flex justify-between">
          <div>
            <SkeletonBlock className="h-7 w-48" />
            <SkeletonBlock className="mt-2 h-3 w-72" />
          </div>
          <SkeletonBlock className="h-4 w-28" />
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonCard key={i}>
            <SkeletonBlock className="h-4 w-56" />
            <SkeletonBlock className="mt-2 h-3 w-full" />
            <SkeletonBlock className="mt-1.5 h-3 w-4/5" />
          </SkeletonCard>
        ))}
        <SkeletonBlock className="h-12 w-full rounded-2xl" />
      </div>
    </AppShell>
  );
}
