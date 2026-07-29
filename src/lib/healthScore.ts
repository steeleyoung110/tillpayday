/**
 * Budget health score: five honest components, 20 points each. Not a
 * gamified pat on the head — every component maps to a number elsewhere in
 * the app, and the weakest one is called out as the thing to fix next.
 *
 *   runway     — days you'd last if income stopped (60+ days = full marks)
 *   efund      — emergency fund progress toward the target months
 *   savingsRate— share of recent income kept (20%+ = full marks)
 *   adherence  — completed cycles that stayed inside plan (last 4)
 *   debt       — debt-free, or measurably paying it down
 */

export interface HealthComponent {
  key: "runway" | "efund" | "savingsRate" | "adherence" | "debt";
  label: string;
  /** 0–20 */
  points: number;
  detail: string;
}

export interface HealthScore {
  /** 0–100 */
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  components: HealthComponent[];
  weakest: HealthComponent;
}

function clamp20(n: number): number {
  return Math.max(0, Math.min(20, Math.round(n)));
}

export function healthScore(input: {
  runwayDays: number | null;
  efundPct: number | null;
  /** Latest month's savings rate %, null = unknown. */
  savingsRatePct: number | null;
  /** Of the last N completed cycles, how many kept the plan. */
  cyclesKept: number;
  cyclesTotal: number;
  /** Total debt now vs peak (null peak = never had debt tracked). */
  debtNow: number;
  debtPeak: number | null;
}): HealthScore {
  const components: HealthComponent[] = [];

  const runwayPts = input.runwayDays === null ? 0 : clamp20((input.runwayDays / 60) * 20);
  components.push({
    key: "runway",
    label: "Runway",
    points: runwayPts,
    detail:
      input.runwayDays === null
        ? "No spending history yet — log spends and this fills in."
        : `${input.runwayDays} days if income stopped (60+ is full marks).`,
  });

  const efundPts = input.efundPct === null ? 0 : clamp20((input.efundPct / 100) * 20);
  components.push({
    key: "efund",
    label: "Emergency fund",
    points: efundPts,
    detail:
      input.efundPct === null
        ? "Add bills so the target can be computed."
        : `${input.efundPct}% of your target months of bills.`,
  });

  const ratePts =
    input.savingsRatePct === null ? 0 : clamp20((input.savingsRatePct / 20) * 20);
  components.push({
    key: "savingsRate",
    label: "Savings rate",
    points: ratePts,
    detail:
      input.savingsRatePct === null
        ? "No complete month of data yet."
        : `Kept ${input.savingsRatePct}% of last month's income (20%+ is full marks).`,
  });

  const adherencePts =
    input.cyclesTotal === 0 ? 0 : clamp20((input.cyclesKept / input.cyclesTotal) * 20);
  components.push({
    key: "adherence",
    label: "Plan adherence",
    points: adherencePts,
    detail:
      input.cyclesTotal === 0
        ? "No completed pay cycles yet."
        : `${input.cyclesKept} of your last ${input.cyclesTotal} cycles stayed inside plan.`,
  });

  let debtPts: number;
  let debtDetail: string;
  if (input.debtNow <= 0) {
    debtPts = 20;
    debtDetail = "No debt on the books. Full marks.";
  } else if (input.debtPeak === null || input.debtPeak <= 0 || input.debtNow >= input.debtPeak) {
    debtPts = 5;
    debtDetail = "Debt exists and isn't shrinking yet — the direction matters more than the size.";
  } else {
    const paid = (input.debtPeak - input.debtNow) / input.debtPeak;
    debtPts = clamp20(5 + paid * 15);
    debtDetail = `${Math.round(paid * 100)}% of your peak debt is gone — the direction is right.`;
  }
  components.push({ key: "debt", label: "Debt", points: debtPts, detail: debtDetail });

  const score = components.reduce((s, c) => s + c.points, 0);
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";
  const weakest = [...components].sort((a, b) => a.points - b.points)[0];

  return { score, grade, components, weakest };
}
