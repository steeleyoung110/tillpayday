"use client";

/**
 * Render children only once they're near the viewport. Splitting a chart into
 * its own chunk isn't enough on its own — Next still fetches that chunk during
 * hydration if the component renders immediately. Gating on visibility is what
 * actually keeps the ~340KB charting library off the critical path for a
 * screen whose important numbers are all text near the top.
 *
 * Holds the exact space it will occupy, so nothing jumps when the real thing
 * arrives. Falls back to rendering immediately where IntersectionObserver
 * isn't available — better a heavy page than a blank one.
 */
import { useEffect, useRef, useState } from "react";

export function InViewport({
  minHeight,
  className = "",
  children,
}: {
  /** Reserved height (CSS length) so the layout doesn't shift. */
  minHeight: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      // Start loading a little before it scrolls into view, so in practice
      // the chart is already there by the time the user arrives.
      { rootMargin: "300px" },
    );
    io.observe(el);

    /**
     * Safety net. Deferring means the chart now depends on this observer
     * firing, and a gray box that never becomes a chart is far worse than a
     * chart that loads a beat early. If nothing has intersected within a few
     * seconds of idle, render it anyway.
     */
    const failsafe = setTimeout(() => setShown(true), 4000);

    return () => {
      io.disconnect();
      clearTimeout(failsafe);
    };
  }, [shown]);

  return (
    <div ref={ref} className={className} style={{ minHeight }}>
      {shown ? (
        children
      ) : (
        <div
          aria-hidden
          className="h-full w-full rounded bg-slate-800 motion-safe:animate-pulse"
          style={{ minHeight }}
        />
      )}
    </div>
  );
}
