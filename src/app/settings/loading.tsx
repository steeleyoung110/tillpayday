import { AppShell } from "@/components/AppShell";
import {
  SkeletonAnnounce,
  SkeletonBlock,
  SkeletonCard,
} from "@/components/Skeleton";

/** Settings skeleton: a stack of titled cards, which is what Settings is. */
export default function SettingsLoading() {
  return (
    <AppShell active="settings">
      <div className="mx-auto max-w-4xl space-y-6 px-6 pt-6">
        <SkeletonAnnounce what="settings" />
        <div>
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="mt-2 h-3 w-64" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i}>
            <SkeletonBlock className="h-4 w-44" />
            <SkeletonBlock className="mt-2 h-3 w-full" />
            <SkeletonBlock className="mt-1.5 h-3 w-2/3" />
            <SkeletonBlock className="mt-3 h-9 w-40" />
          </SkeletonCard>
        ))}
      </div>
    </AppShell>
  );
}
