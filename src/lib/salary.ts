/**
 * Salary → per-paycheck math. People on salary know "$65k a year, paid every
 * two weeks" — not what one check is. This converts for them.
 *
 * Honesty matters here: salary ÷ checks is the BEFORE-TAX number, and what
 * lands in the bank is usually 20–30% less. Callers pass takeHomePct when the
 * user knows their real take-home share; the UI must warn loudly at 100%.
 */

export const CHECKS_PER_YEAR = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
} as const;

export type PayFrequency = keyof typeof CHECKS_PER_YEAR;

export function isPayFrequency(v: string): v is PayFrequency {
  return v in CHECKS_PER_YEAR;
}

/**
 * One paycheck from an annual salary, rounded to the cent.
 * takeHomePct scales for taxes/deductions (100 = gross). Nonsense inputs
 * (zero/negative salary, pct outside 1–100) return 0 so forms stay disabled.
 */
export function salaryPerCheck(
  annualSalary: number,
  frequency: PayFrequency,
  takeHomePct = 100,
): number {
  if (!(annualSalary > 0) || !(takeHomePct > 0) || takeHomePct > 100) return 0;
  const gross = annualSalary / CHECKS_PER_YEAR[frequency];
  return Math.round(gross * takeHomePct) / 100;
}
