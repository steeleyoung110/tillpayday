"use client";

/**
 * Re-reads the page once a minute while the market is open and the tab is
 * in view, so live prices keep moving. Server data refreshes in place;
 * nothing on the page resets. Outside market hours (or with no live key)
 * it does nothing.
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

function marketOpen(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  if (get("weekday") === "Sat" || get("weekday") === "Sun") return false;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60 + 5;
}

export function LiveRefresh({ enabled, onlyWhenOpen }: { enabled: boolean; onlyWhenOpen?: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible" || !marketOpen()) return;
      // On the Board, only while the Stocks dropdown is open.
      if (onlyWhenOpen && !document.querySelector(`${onlyWhenOpen}[open]`)) return;
      router.refresh();
    }, 60_000);
    return () => clearInterval(id);
  }, [enabled, onlyWhenOpen, router]);
  return null;
}
