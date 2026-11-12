import { AppShell } from "@/components/AppShell";
import { SkeletonAnnounce, SkeletonBlock, SkeletonCard } from "@/components/Skeleton";

/** Board skeleton: a snapshot strip over a row of columns. */
export default function BoardLoading() {
  return (
    <AppShell active="board">
      <div className="space-y-5 px-4 pt-6 sm:px-6">
        <SkeletonAnnounce what="board" />
        <SkeletonBlock className="h-6 w-40" />
        <SkeletonBlock className="h-16 w-full" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i}>
              <SkeletonBlock className="h-5 w-32" />
              <SkeletonBlock className="mt-4 h-7 w-full" />
              <SkeletonBlock className="mt-4 h-7 w-full" />
            </SkeletonCard>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
