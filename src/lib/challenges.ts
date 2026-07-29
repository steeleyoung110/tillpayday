/**
 * Money challenges: light structure, real dollars. All state lives in the
 * auth user's metadata (start dates) plus data the app already has — no
 * schema. Pure math here; the card renders it.
 */
import { addDays, parseISO, toISO } from "@/lib/engine";

/** 52-week ladder: week N deposits $N; the whole run banks $1,378. */
export interface Week52Status {
  /** Current week number, 1–52. */
  week: number;
  /** This week's deposit. */
  dueThisWeek: number;
  /** What the ladder should hold by the end of this week. */
  targetToDate: number;
  totalTarget: number;
  complete: boolean;
}

export function week52Status(startISO: string, todayISO: string): Week52Status | null {
  if (startISO > todayISO) return null;
  const elapsedDays = Math.floor(
    (Date.parse(todayISO) - Date.parse(startISO)) / 86400000,
  );
  const week = Math.floor(elapsedDays / 7) + 1;
  if (week > 52) {
    return { week: 52, dueThisWeek: 0, targetToDate: 1378, totalTarget: 1378, complete: true };
  }
  return {
    week,
    dueThisWeek: week,
    targetToDate: (week * (week + 1)) / 2,
    totalTarget: 1378,
    complete: false,
  };
}

/** No-spend week: 7 days without fun-money spending, from a chosen start. */
export interface NoSpendStatus {
  startISO: string;
  endISO: string;
  /** Clean days completed so far (0–7). */
  daysDone: number;
  failed: boolean;
  failDate: string | null;
  complete: boolean;
}

export function noSpendStatus(
  startISO: string,
  todayISO: string,
  funSpendDates: string[],
): NoSpendStatus | null {
  if (startISO > todayISO) return null;
  const endISO = toISO(addDays(parseISO(startISO), 6));
  const inWindow = funSpendDates
    .filter((d) => d >= startISO && d <= endISO && d <= todayISO)
    .sort();
  const failed = inWindow.length > 0;
  const elapsed =
    Math.floor((Date.parse(todayISO) - Date.parse(startISO)) / 86400000) + 1;
  const daysDone = failed
    ? Math.max(
        0,
        Math.floor((Date.parse(inWindow[0]) - Date.parse(startISO)) / 86400000),
      )
    : Math.min(7, elapsed);
  return {
    startISO,
    endISO,
    daysDone,
    failed,
    failDate: failed ? inWindow[0] : null,
    complete: !failed && todayISO > endISO,
  };
}
