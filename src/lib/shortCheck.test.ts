import { describe, expect, it } from "vitest";
import { detectShortCheck } from "./shortCheck";
import type { IncomeEntry } from "@/lib/engine";

const entry = (
  id: string,
  amount: number,
  receivedDate: string,
  isWindfall = false,
): IncomeEntry => ({ id, amount, receivedDate, isWindfall });

const TODAY = "2026-08-03";
const LAST_PAYDAY = "2026-07-31";

describe("detectShortCheck", () => {
  it("flags a check under 90% of typical", () => {
    const s = detectShortCheck(
      [entry("a", 1290, "2026-07-31")],
      1500,
      LAST_PAYDAY,
      TODAY,
    )!;
    expect(s.shortBy).toBe(210);
    expect(s.pct).toBe(86);
  });

  it("ignores checks at or above the threshold", () => {
    expect(
      detectShortCheck([entry("a", 1400, "2026-07-31")], 1500, LAST_PAYDAY, TODAY),
    ).toBeNull();
  });

  it("ignores windfalls, older cycles, and unknown typical", () => {
    expect(
      detectShortCheck([entry("a", 200, "2026-07-31", true)], 1500, LAST_PAYDAY, TODAY),
    ).toBeNull();
    expect(
      detectShortCheck([entry("a", 200, "2026-07-15")], 1500, LAST_PAYDAY, TODAY),
    ).toBeNull();
    expect(
      detectShortCheck([entry("a", 200, "2026-07-31")], 0, LAST_PAYDAY, TODAY),
    ).toBeNull();
    expect(detectShortCheck([entry("a", 200, "2026-07-31")], 1500, null, TODAY)).toBeNull();
  });

  it("uses the most recent qualifying entry", () => {
    const s = detectShortCheck(
      [entry("older", 500, "2026-07-31"), entry("newer", 800, "2026-08-02")],
      1500,
      LAST_PAYDAY,
      TODAY,
    )!;
    expect(s.entryId).toBe("newer");
  });
});
