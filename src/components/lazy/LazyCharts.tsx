"use client";

/**
 * Lazy chart wrappers. Recharts is by far the heaviest thing we ship, and
 * none of it is needed for the first paint — the numbers that matter are
 * text. These wrappers keep it out of the initial bundle.
 *
 * They must live in a Client Component: in this version of Next, a Server
 * Component dynamically importing a Client Component does NOT code-split
 * (see node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md). So the
 * server pages import these wrappers, and the wrapper does the dynamic
 * import from client context, where splitting works.
 */
import dynamic from "next/dynamic";
import { SkeletonBlock } from "@/components/Skeleton";
import type { PieSlice } from "@/components/PaycheckPie";
import type { LoanPrefill } from "@/components/GrowTab";
import type { SnapshotRow } from "@/lib/rows";

/** Placeholder that holds the chart's space so nothing jumps when it lands. */
function ChartFallback({ className = "h-64" }: { className?: string }) {
  return <SkeletonBlock className={`w-full ${className}`} />;
}

export const LazyPaycheckPie = dynamic(
  () => import("@/components/PaycheckPie").then((m) => m.PaycheckPie),
  { ssr: false, loading: () => <ChartFallback className="h-40 w-40 rounded-full" /> },
) as (props: { slices: PieSlice[]; paycheck: number }) => React.ReactElement;

export const LazyNetWorthChart = dynamic(
  () => import("@/components/NetWorthChart").then((m) => m.NetWorthChart),
  { ssr: false, loading: () => <ChartFallback className="h-72" /> },
) as (props: { snapshots: SnapshotRow[]; todayISO: string }) => React.ReactElement;

export const LazyGrowTab = dynamic(
  () => import("@/components/GrowTab").then((m) => m.GrowTab),
  { ssr: false, loading: () => <ChartFallback className="h-96" /> },
) as (props: { prefills: LoanPrefill[] }) => React.ReactElement;
