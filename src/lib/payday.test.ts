import { describe, expect, it } from "vitest";
import { nextPayday, paydayLabel } from "./payday";
import type { IncomeRow } from "./rows";

const mk = (over: Partial<IncomeRow>): IncomeRow => ({
  id: "i",
  name: "Job",
  amount: 1000,
  frequency: "biweekly",
  kind: "paycheck",
  anchor_date: "2026-07-10",
  created_at: "2026-01-01",
  ...over,
});

describe("nextPayday", () => {
  it("returns null with no income", () => {
    expect(nextPayday([], "2026-07-22")).toBeNull();
  });

  it("projects the next biweekly date from the anchor", () => {
    // Anchor Jul 10 → Jul 24 is the first on/after Jul 22.
    expect(nextPayday([mk({})], "2026-07-22")).toBe("2026-07-24");
  });

  it("counts today as payday", () => {
    expect(nextPayday([mk({})], "2026-07-24")).toBe("2026-07-24");
  });

  it("takes the earliest across multiple paychecks", () => {
    const other = mk({ id: "j", frequency: "monthly", anchor_date: "2026-07-23" });
    expect(nextPayday([mk({}), other], "2026-07-22")).toBe("2026-07-23");
  });

  it("prefers paychecks but falls back to side income", () => {
    const side = mk({ id: "s", kind: "side", frequency: "monthly", anchor_date: "2026-07-23" });
    // Side income alone still gives a date…
    expect(nextPayday([side], "2026-07-22")).toBe("2026-07-23");
    // …but a real paycheck wins even when the side gig pays sooner.
    expect(nextPayday([side, mk({})], "2026-07-22")).toBe("2026-07-24");
  });
});

describe("paydayLabel", () => {
  it("formats today, tomorrow, and future paydays", () => {
    expect(paydayLabel("2026-07-22", "2026-07-22")).toBe("Payday is today! (Jul 22) 🎉");
    expect(paydayLabel("2026-07-23", "2026-07-22")).toBe("Payday is tomorrow (Jul 23)");
    expect(paydayLabel("2026-08-01", "2026-07-22")).toBe("10 days till payday (Aug 1)");
  });
});
