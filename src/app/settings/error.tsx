"use client";

import { AppShell } from "@/components/AppShell";
import { ErrorPanel } from "@/components/ErrorPanel";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppShell active="settings">
      <ErrorPanel error={error} reset={reset} what="your settings" />
    </AppShell>
  );
}
