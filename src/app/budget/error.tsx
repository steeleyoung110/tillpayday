"use client";

import { AppShell } from "@/components/AppShell";
import { ErrorPanel } from "@/components/ErrorPanel";

export default function BudgetError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppShell active="budget">
      <ErrorPanel error={error} reset={reset} what="your budget" />
    </AppShell>
  );
}
