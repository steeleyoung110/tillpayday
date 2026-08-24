"use client";

/**
 * Confetti, rationed. It fires for exactly three things — a payday sweep, a
 * goal completed, a streak milestone — because a celebration that happens for
 * everything is just noise, and this app's job is to be trusted, not chirpy.
 *
 * Reduced motion gets a static burst of the same colors in the same place:
 * the moment is still marked, nothing moves. No canvas, no dependency —
 * a few dozen absolutely-positioned pieces on a CSS animation.
 */
import { useEffect, useMemo, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";

const COLORS = ["#34d399", "#fbbf24", "#60a5fa", "#f472b6", "#a78bfa"];

export function Confetti({
  /** Fire once when this becomes true. */
  active,
  pieces = 36,
}: {
  active: boolean;
  pieces?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const [done, setDone] = useState(false);
  /**
   * Decide nothing until we're on the client. Confetti is decoration, so
   * rendering none of it server-side avoids both a hydration mismatch and
   * the trap of committing to "reduced motion" before we can actually ask.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Positions are fixed per mount so a re-render doesn't reshuffle mid-flight.
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        left: (i * 97) % 100, // spread deterministically, no Math.random in render
        delay: (i % 12) * 45,
        drift: ((i % 5) - 2) * 14,
        color: COLORS[i % COLORS.length],
        size: 6 + (i % 3) * 3,
      })),
    [pieces],
  );

  useEffect(() => {
    if (!active || reduced) return;
    const t = setTimeout(() => setDone(true), 2600);
    return () => clearTimeout(t);
  }, [active, reduced]);

  if (!mounted || !active || done) return null;

  if (reduced) {
    // Static equivalent: a still band of color, present but motionless.
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 flex justify-center gap-1.5 pt-2"
      >
        {bits.slice(0, 12).map((b, i) => (
          <span
            key={i}
            style={{ backgroundColor: b.color, width: b.size, height: b.size }}
            className="inline-block rounded-sm"
          />
        ))}
      </div>
    );
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {bits.map((b, i) => (
        <span
          key={i}
          className="absolute top-0 rounded-sm"
          style={{
            left: `${b.left}%`,
            width: b.size,
            height: b.size,
            backgroundColor: b.color,
            animation: `confettiFall 2.2s cubic-bezier(.25,.6,.4,1) ${b.delay}ms forwards`,
            // Each piece drifts a little so it doesn't read as falling rain.
            ["--drift" as string]: `${b.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
