"use client";

/**
 * Offline honesty. When the connection drops, the service worker keeps
 * showing the last dashboard — which is genuinely useful, and genuinely
 * misleading if we don't say so. This is the saying-so.
 *
 * It also guards the save paths: an edit made offline would post into a void
 * and be silently lost, which for a budget is worse than not being able to
 * edit at all. So we block it and say why.
 */
import { useEffect, useState } from "react";

/** Read by save paths to refuse work that would vanish. */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function OfflineBadge() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[80] bg-amber-500/95 px-4 py-1.5 text-center text-xs font-semibold text-slate-950"
    >
      Offline — showing your last numbers. Changes can&apos;t save until
      you&apos;re back.
    </div>
  );
}
