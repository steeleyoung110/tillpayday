import { AppShell } from "@/components/AppShell";
import {
  SkeletonAnnounce,
  SkeletonBlock,
  SkeletonCard,
} from "@/components/Skeleton";

/** Updates skeleton: what's-new list, the send box, your threads. */
export default function UpdatesLoading() {
  return (
    <AppShell active="updates">
      <div className="mx-auto max-w-3xl space-y-6 px-6 pt-6">
        <SkeletonAnnounce what="updates" />
        <div>
          <SkeletonBlock className="h-7 w-56" />
          <SkeletonBlock className="mt-2 h-3 w-full max-w-lg" />
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonCard key={i}>
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="mt-3 h-16 w-full" />
          </SkeletonCard>
        ))}
      </div>
    </AppShell>
  );
}
