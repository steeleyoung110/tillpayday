"use client";

/**
 * Re-fetches the current server component tree on an interval — keeps the
 * admin dashboard "live" without websockets. Renders a tiny heartbeat label.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
      setTick((t) => t + 1);
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return (
    <span className="text-xs text-slate-400">
      {`live · refreshes every ${seconds}s${tick > 0 ? ` · updated ${tick}×` : ""}`}
    </span>
  );
}
