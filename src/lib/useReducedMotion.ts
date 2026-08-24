"use client";

/**
 * Does this person want less motion? Read once on mount and kept in sync if
 * they change the setting while the app is open. Everything decorative in the
 * app asks this before moving.
 */
import { useEffect, useState } from "react";

export function usePrefersReducedMotion(): boolean {
  // Assume "no motion" until we know, so the first paint is never a surprise
  // for someone who asked for stillness.
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
