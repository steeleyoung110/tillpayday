import { AppShell } from "@/components/AppShell";
import {
  SkeletonAnnounce,
  SkeletonBlock,
  SkeletonCard,
  SkeletonPanel,
} from "@/components/Skeleton";

/** Admin skeleton: the people tiles, signup bars, inbox. */
export default function AdminLoading() {
  return (
    <AppShell active="settings">
      <div className="mx-auto max-w-screen-2xl space-y-6 px-6 pt-6 2xl:px-10">
        <SkeletonAnnounce what="admin dashboard" />
        <SkeletonBlock className="h-6 w-48" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <SkeletonCard key={i} className="p-4">
              <SkeletonBlock className="h-3 w-16" />
              <SkeletonBlock className="mt-2 h-7 w-12" />
            </SkeletonCard>
          ))}
        </div>
        <SkeletonPanel lines={4} />
        <SkeletonPanel lines={3} />
      </div>
    </AppShell>
  );
}
