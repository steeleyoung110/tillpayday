"use client";

/**
 * The hero number, counting up. It arrives with a little momentum on load and
 * rolls to its new value when the number changes — so a spend you just logged
 * visibly moves the number rather than silently swapping it.
 *
 * Reduced motion gets the final value immediately, no animation frame at all.
 * Money is never mid-count when it matters: the animation is capped short,
 * and the last frame is always the exact value, never a rounded approximation.
 */
import { useEffect, useRef, useState } from "react";

const DURATION_MS = 550;

/** Ease-out: fast start, gentle landing. Feels like it settles, not stops. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  /** Formatter for every intermediate frame (usually a currency format). */
  format: (n: number) => string;
  className?: string;
}) {
  /**
   * Start at zero so the very first render counts UP to the number rather
   * than simply presenting it. Every later change animates from wherever the
   * number already was.
   */
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const from = fromRef.current;
    const to = value;
    if (reduced || from === to) {
      fromRef.current = to;
      setShown(to);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      if (t >= 1) {
        // Land on the exact number — never a rounding artifact.
        setShown(to);
        fromRef.current = to;
        rafRef.current = null;
        return;
      }
      setShown(from + (to - from) * easeOut(t));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      fromRef.current = to;
    };
  }, [value]);

  return (
    <span className={className}>
      {format(shown)}
    </span>
  );
}
