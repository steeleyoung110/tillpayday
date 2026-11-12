import { AppShell } from "@/components/AppShell";
import { SkeletonAnnounce, SkeletonBlock, SkeletonCard } from "@/components/Skeleton";

/** Stocks skeleton: header, tabs, number cards, a chart panel. */
export default function StocksLoading() {
  return (
    <AppShell active="stocks">
      <div className="mx-auto max-w-screen-xl space-y-5 px-4 pt-6 sm:px-6">
        <SkeletonAnnounce what="stocks" />
        <SkeletonBlock className="h-7 w-48" />
        <SkeletonBlock className="h-8 w-full max-w-lg" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonCard key={i}>
              <SkeletonBlock className="h-4 w-20" />
              <SkeletonBlock className="mt-3 h-7 w-28" />
            </SkeletonCard>
          ))}
        </div>
        <SkeletonBlock className="h-72 w-full" />
      </div>
    </AppShell>
  );
}
