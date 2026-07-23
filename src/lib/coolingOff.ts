/**
 * 48-hour cooling-off timer for what-if purchases. Pure functions shared by
 * the server (which enforces the rule) and the client countdown display.
 */

export const COOLING_OFF_HOURS = 48;
export const COOLING_OFF_MS = COOLING_OFF_HOURS * 60 * 60 * 1000;

export type CoolingPhase = "none" | "cooling" | "ready";

export interface CoolingState {
  phase: CoolingPhase;
  /** Milliseconds until the purchase can be confirmed (0 unless cooling). */
  remainingMs: number;
  /** When the timer expires (ms epoch; 0 when no timer is running). */
  endsAtMs: number;
}

/** Where a what-if stands, given when (if ever) its timer started. */
export function coolingState(
  startedAtISO: string | null,
  nowMs: number,
): CoolingState {
  if (!startedAtISO) return { phase: "none", remainingMs: 0, endsAtMs: 0 };
  const endsAtMs = new Date(startedAtISO).getTime() + COOLING_OFF_MS;
  const remainingMs = endsAtMs - nowMs;
  if (remainingMs <= 0) return { phase: "ready", remainingMs: 0, endsAtMs };
  return { phase: "cooling", remainingMs, endsAtMs };
}

/** "47h 59m" / "3h 0m" / "42m" / "under a minute". */
export function formatRemaining(remainingMs: number): string {
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  if (totalMinutes < 1) return "under a minute";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
