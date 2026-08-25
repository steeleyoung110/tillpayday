"use client";

import { AppShell } from "@/components/AppShell";
import { ErrorPanel } from "@/components/ErrorPanel";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppShell active="dashboard">
      <ErrorPanel error={error} reset={reset} what="your dashboard" />
    </AppShell>
  );
}
