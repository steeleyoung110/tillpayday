/**
 * Goal outlook math: given the projection's savings line and a goal, answer
 * the questions that matter — when do I get there at this pace, does that
 * beat my target date, what does a little extra per month change, and what
 * exact extra hits the date. Pure and unit-tested.
 */
import { diffDays, parseISO } from "@/lib/engine";

export interface GoalLike {
  targetAmount: number;
  targetDate: string; // YYYY-MM-DD
}

export interface SavingsPoint {
  date: string;
  savings: number;
}

export interface GoalOutlook {
  /** Already sitting at/above the target today. */
  achievedNow: boolean;
  /** First projected date the savings line crosses the target (null = not
   * within the projection horizon). */
  reachDate: string | null;
  /** Whole months from today until reachDate. */
  monthsAway: number | null;
  /** reachDate lands on or before the goal's target date. */
  onTrack: boolean;
  /** The what-if illustration: reach date with `boostAmount` more per month. */
  boostAmount: number;
  boostedReachDate: string | null;
  boostedMonthsAway: number | null;
  /** Smallest extra per month, starting now, that hits the target BY the
   * target date. 0 when already on track; null when the target date has
   * passed or no amount within reason gets there. */
  requiredExtraPerMonth: number | null;
}

const DAYS_PER_MONTH = 30.44;

function monthsFrom(todayISO: string, dateISO: string): number {
  return Math.max(
    0,
    Math.round(diffDays(parseISO(todayISO), parseISO(dateISO)) / DAYS_PER_MONTH),
  );
}

/** First date the (optionally boosted) savings line crosses the target. */
function crossing(
  points: SavingsPoint[],
  target: number,
  todayISO: string,
  extraPerMonth = 0,
): string | null {
  const today = parseISO(todayISO);
  for (const p of points) {
    const monthsElapsed = Math.max(0, diffDays(today, parseISO(p.date))) / DAYS_PER_MONTH;
    if (p.savings + extraPerMonth * monthsElapsed >= target - 0.005) return p.date;
  }
  return null;
}

export function goalOutlook(
  points: SavingsPoint[],
  goal: GoalLike,
  todayISO: string,
  boostAmount = 100,
): GoalOutlook {
  const currentSavings = points[0]?.savings ?? 0;
  const achievedNow = currentSavings >= goal.targetAmount;

  const reachDate = crossing(points, goal.targetAmount, todayISO);
  const monthsAway = reachDate ? monthsFrom(todayISO, reachDate) : null;
  const onTrack =
    achievedNow || (reachDate !== null && reachDate <= goal.targetDate);

  const boostedReachDate = achievedNow
    ? reachDate
    : crossing(points, goal.targetAmount, todayISO, boostAmount);
  const boostedMonthsAway = boostedReachDate
    ? monthsFrom(todayISO, boostedReachDate)
    : null;

  // What would actually hit the target date?
  let requiredExtraPerMonth: number | null = null;
  const monthsUntilTarget = monthsFrom(todayISO, goal.targetDate);
  if (achievedNow || onTrack) {
    requiredExtraPerMonth = 0;
  } else if (monthsUntilTarget >= 1) {
    const atTarget = [...points]
      .filter((p) => p.date <= goal.targetDate)
      .pop();
    if (atTarget) {
      const shortfall = goal.targetAmount - atTarget.savings;
      requiredExtraPerMonth = Math.ceil(shortfall / monthsUntilTarget);
    }
  }

  return {
    achievedNow,
    reachDate,
    monthsAway,
    onTrack,
    boostAmount,
    boostedReachDate,
    boostedMonthsAway,
    requiredExtraPerMonth,
  };
}
