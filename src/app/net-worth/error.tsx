"use client";

import { AppShell } from "@/components/AppShell";
import { ErrorPanel } from "@/components/ErrorPanel";

export default function NetWorthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppShell active="networth">
      <ErrorPanel error={error} reset={reset} what="your net worth" />
    </AppShell>
  );
}
