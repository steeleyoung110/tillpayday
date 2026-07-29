/**
 * Bill terrain: the next 12 months of scheduled bills as a landscape —
 * quarterly and yearly bills make some months mountains, and knowing which
 * month is the mountain is how sinking funds get sized.
 */
import {
  addDays,
  generateOccurrences,
  type Expense,
} from "@/lib/engine";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface TerrainMonth {
  key: string; // YYYY-MM
  label: string; // "Aug"
  total: number;
  /** Bills beyond the every-month baseline (quarterly/yearly lumps). */
  lumpy: { name: string; amount: number }[];
}

export interface BillTerrain {
  months: TerrainMonth[];
  heaviest: TerrainMonth;
  lightest: TerrainMonth;
  average: number;
}

const LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function billTerrain(
  expenses: Expense[],
  todayISO: string,
): BillTerrain | null {
  const recurring = expenses.filter((e) => !e.isPaused && e.cadence !== "one_time");
  if (recurring.length === 0) return null;

  const start = new Date(`${todayISO.slice(0, 7)}-01T00:00:00Z`);
  const months: TerrainMonth[] = [];
  for (let m = 0; m < 12; m += 1) {
    const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 1));
    const last = addDays(
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m + 1, 1)),
      -1,
    );
    let total = 0;
    const lumpy: { name: string; amount: number }[] = [];
    for (const e of recurring) {
      const hits = generateOccurrences(e.dueDate, e.cadence, first, last).length;
      if (hits === 0) continue;
      total += hits * e.amount;
      if (e.cadence !== "monthly") lumpy.push({ name: e.name, amount: e.amount });
    }
    months.push({
      key: `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}`,
      label: LABELS[first.getUTCMonth()],
      total: round2(total),
      lumpy: lumpy.sort((a, b) => b.amount - a.amount),
    });
  }

  const heaviest = months.reduce((a, b) => (b.total > a.total ? b : a));
  const lightest = months.reduce((a, b) => (b.total < a.total ? b : a));
  return {
    months,
    heaviest,
    lightest,
    average: round2(months.reduce((s, x) => s + x.total, 0) / 12),
  };
}
