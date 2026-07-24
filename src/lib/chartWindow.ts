/**
 * Chart view-window logic for the projection graph: zoom presets (1 month …
 * 10 years) and a custom from/to date range. Pure and unit-tested; the
 * ProjectionSection component just applies the plan it returns.
 *
 * The simulation always starts today (that's where real balances are known);
 * the window chooses which slice of it the chart displays.
 */
import { addMonths, diffDays, parseISO, toISO } from "@/lib/engine";

export interface ChartViewWindow {
  from: string; // ISO, >= today
  to: string; // ISO, > from
}

/** How the chart should render a given window. */
export interface WindowPlan {
  /** Sample every N days (denser when zoomed in; 1 = daily). */
  stepDays: number;
  /** X-axis tick style: "Jul 24" / "Jul" / "Jul '26". */
  granularity: "day" | "month" | "monthYear";
  /** Simulation length needed to cover the window end, in whole months. */
  monthsToProject: number;
}

export const PRESET_MONTHS = [1, 3, 6, 12, 24, 60, 120] as const;

/** Default zoom: one year out. */
export const DEFAULT_PRESET = 12;

export function presetLabel(months: number): string {
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = months / 12;
  return `${years} year${years === 1 ? "" : "s"}`;
}

/** The window a preset button represents: today → today + N months. */
export function presetWindow(todayISO: string, months: number): ChartViewWindow {
  return {
    from: todayISO,
    to: toISO(addMonths(parseISO(todayISO), months)),
  };
}

/**
 * Make any user-entered pair usable: `from` can't precede today (the sim has
 * no past), `to` must land after `from`, and the far edge caps at 10 years.
 */
export function sanitizeWindow(
  fromISO: string,
  toISO_: string,
  todayISO: string,
): ChartViewWindow {
  const today = parseISO(todayISO);
  const cap = addMonths(today, 120);

  let from = fromISO ? parseISO(fromISO) : today;
  if (!(from >= today)) from = today;
  if (from > cap) from = today;

  let to = toISO_ ? parseISO(toISO_) : addMonths(today, 60);
  if (to > cap) to = cap;
  if (!(to > from)) to = addMonths(from, 1);
  if (to > cap) to = cap; // from near the cap: fall back to the cap itself

  return { from: toISO(from), to: toISO(to) };
}

/** Zoom plan: how densely to sample and how to label ticks. */
export function windowPlan(w: ChartViewWindow, todayISO: string): WindowPlan {
  const days = diffDays(parseISO(w.from), parseISO(w.to));
  const stepDays =
    days <= 70 ? 1 : days <= 200 ? 3 : days <= 420 ? 7 : days <= 1500 ? 14 : 30;

  const spansYears =
    parseISO(w.to).getUTCFullYear() !== parseISO(w.from).getUTCFullYear();
  const granularity: WindowPlan["granularity"] =
    days <= 200 ? "day" : spansYears ? "monthYear" : "month";

  // Whole months of simulation, counted from today, to cover the window end.
  const today = parseISO(todayISO);
  const to = parseISO(w.to);
  let months = 1;
  while (addMonths(today, months) < to && months < 120) months += 1;

  return { stepDays, granularity, monthsToProject: months };
}

/** Filter dated points to the window and thin them to the step (keeps ends,
 * plus an optional must-keep date such as "today" for a marker line). */
export function sampleWindow<T extends { date: string }>(
  points: T[],
  w: ChartViewWindow,
  stepDays: number,
  keepDate?: string,
): T[] {
  const inRange = points.filter((p) => p.date >= w.from && p.date <= w.to);
  return inRange.filter(
    (p, i) =>
      i % stepDays === 0 || i === inRange.length - 1 || p.date === keepDate,
  );
}
