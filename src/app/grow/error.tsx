"use client";

import { AppShell } from "@/components/AppShell";
import { ErrorPanel } from "@/components/ErrorPanel";

export default function GrowError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppShell active="grow">
      <ErrorPanel error={error} reset={reset} what="the calculators" />
    </AppShell>
  );
}
