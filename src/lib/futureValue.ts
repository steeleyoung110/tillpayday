/**
 * Future-me price tag: what a recurring monthly amount becomes if invested
 * instead. Standard future-value-of-annuity, monthly compounding, default
 * 10 years at 7%/yr (long-run market-ish, stated as an assumption not a
 * promise). The honest cost of "it's only $15 a month."
 */

export function futureValueMonthly(
  monthlyAmount: number,
  years = 10,
  annualRatePct = 7,
): number {
  if (!(monthlyAmount > 0) || !(years > 0)) return 0;
  const r = annualRatePct / 100 / 12;
  const n = Math.round(years * 12);
  const fv = r === 0 ? monthlyAmount * n : monthlyAmount * ((Math.pow(1 + r, n) - 1) / r);
  return Math.round(fv);
}
