/**
 * Haptics. A short buzz confirms a thing happened without another toast
 * competing for your eyes — but it's decoration, so it stays quiet whenever
 * the device or the person has said no: no Vibration API, reduced-motion
 * preference, or a desktop that would ignore it anyway.
 *
 * Patterns are deliberately tiny. Anything you'd notice as "a vibration"
 * rather than "a confirmation" is too long.
 */

type Feel = "save" | "sweep" | "skip" | "warn";

const PATTERNS: Record<Feel, number | number[]> = {
  /** Something saved. The lightest tap the API can express. */
  save: 10,
  /** Payday sweep — a two-beat, because money actually moved. */
  sweep: [14, 40, 22],
  /** You said no to a purchase. A small, satisfying double. */
  skip: [10, 30, 10],
  /** Something needs attention — slightly longer, still not alarming. */
  warn: 32,
};

function allowed(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (typeof navigator.vibrate !== "function") return false;
  // Motion sensitivity covers haptics too — a buzz is motion you feel.
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function haptic(feel: Feel = "save"): void {
  if (!allowed()) return;
  try {
    navigator.vibrate(PATTERNS[feel]);
  } catch {
    // Some browsers throw when the page isn't focused. Never worth an error.
  }
}
