"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRemaining } from "@/lib/coolingOff";

/**
 * Live countdown chip for a what-if in its 48-hour cooling-off period.
 * Ticks every 30s; when the timer hits zero it refreshes the page so the
 * server re-renders with the "confirm purchase" button.
 */
export function CoolingCountdown({ endsAtMs }: { endsAtMs: number }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(() => endsAtMs - Date.now());

  useEffect(() => {
    const tick = () => {
      const left = endsAtMs - Date.now();
      setRemaining(left);
      if (left <= 0) router.refresh();
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [endsAtMs, router]);

  if (remaining <= 0) return null;

  return (
    <span
      className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300"
      title="You can confirm this purchase when the timer runs out — or skip it any time."
    >
      {`⏳ ${formatRemaining(remaining)} to think it over`}
    </span>
  );
}
