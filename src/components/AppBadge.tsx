"use client";

/**
 * Installed-app icon badge (Badging API): shows days until payday on the
 * home-screen icon. No-ops silently where unsupported (regular browser tabs).
 */
import { useEffect } from "react";

export function AppBadge({ count }: { count: number | null }) {
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count && count > 0) nav.setAppBadge?.(count).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [count]);
  return null;
}
