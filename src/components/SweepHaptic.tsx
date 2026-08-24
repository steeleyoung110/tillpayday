"use client";

/**
 * The payday buzz: fires once when the celebration mounts. Separate from the
 * overlay so the overlay stays a plain render and this stays a single effect
 * that can't accidentally run twice on re-render.
 */
import { useEffect, useRef } from "react";
import { haptic } from "@/lib/haptics";

export function SweepHaptic() {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    haptic("sweep");
  }, []);
  return null;
}
