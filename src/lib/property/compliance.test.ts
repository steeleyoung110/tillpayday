import { describe, expect, it } from "vitest";
import { currentLease, leaseCounts, leaseStatus, reportCounts, reportPeriods } from "./compliance";

const TODAY = "2026-11-12";

describe("lease status", () => {
  it("in progress, due soon within 60 days, past due once the end passes, complete when closed out", () => {
    expect(leaseStatus({ status: "active", end_date: "2027-06-30" }, TODAY)).toEqual({ state: "in_progress", daysLeft: 230 });
    expect(leaseStatus({ status: "active", end_date: null }, TODAY)).toEqual({ state: "in_progress", daysLeft: null });
    expect(leaseStatus({ status: "active", end_date: "2027-01-11" }, TODAY)).toEqual({ state: "due_soon", daysLeft: 60 });
    expect(leaseStatus({ status: "active", end_date: "2027-01-12" }, TODAY).state).toBe("in_progress");
    expect(leaseStatus({ status: "active", end_date: "2026-11-12" }, TODAY)).toEqual({ state: "due_soon", daysLeft: 0 });
    expect(leaseStatus({ status: "active", end_date: "2026-10-31" }, TODAY)).toEqual({ state: "past_due", daysLeft: -12 });
    expect(leaseStatus({ status: "ended", end_date: "2026-10-31" }, TODAY).state).toBe("complete");
  });

  it("an expired lease nobody renewed is still the unit's current lease", () => {
    const leases = [
      { id: "old", unit_id: "u", status: "ended" as const, start_date: "2024-11-01" },
      { id: "cur", unit_id: "u", status: "active" as const, start_date: "2025-11-01" },
      { id: "future", unit_id: "u", status: "active" as const, start_date: "2027-01-01" },
      { id: "other", unit_id: "x", status: "active" as const, start_date: "2026-01-01" },
    ];
    expect(currentLease(leases, "u", TODAY)?.id).toBe("cur");
    expect(currentLease(leases, "none", TODAY)).toBeNull();
  });

  it("counts lease tiles", () => {
    expect(
      leaseCounts([
        { state: "past_due", hasFile: false },
        { state: "due_soon", hasFile: true },
        { state: "in_progress", hasFile: false },
        { state: "in_progress", hasFile: true },
        { state: "complete", hasFile: false },
      ]),
    ).toEqual({ red: 1, orange: 1, blue: 3 });
  });
});

describe("rental reports", () => {
  it("monthly: each finished month is due for 15 days, then past due; the running month waits", () => {
    const p = reportPeriods("monthly", "2026-09-01", null, ["2026-09-01"], TODAY);
    expect(p.map((x) => [x.label, x.dueDate, x.state])).toEqual([
      ["Nov 2026", "2026-12-15", "in_progress"],
      ["Oct 2026", "2026-11-15", "due"],
      ["Sep 2026", "2026-10-15", "uploaded"],
    ]);
    expect(reportCounts(p)).toEqual({ red: 0, orange: 1, blue: 1 });
    const late = reportPeriods("monthly", "2026-09-01", null, [], "2026-11-16");
    expect(late.find((x) => x.label === "Oct 2026")!.state).toBe("past_due");
    expect(late.find((x) => x.label === "Sep 2026")!.state).toBe("past_due");
  });

  it("quarterly: calendar quarters with 30 days to upload", () => {
    const p = reportPeriods("quarterly", "2026-08-15", null, [], TODAY);
    expect(p.map((x) => [x.label, x.start, x.end, x.dueDate, x.state])).toEqual([
      ["Q4 2026", "2026-10-01", "2026-12-31", "2027-01-30", "in_progress"],
      ["Q3 2026", "2026-07-01", "2026-09-30", "2026-10-30", "past_due"],
    ]);
    expect(reportCounts(p)).toEqual({ red: 1, orange: 0, blue: 1 });
  });

  it("honors custom grace days and year rollover", () => {
    const p = reportPeriods("monthly", "2026-12-01", 5, [], "2027-01-03");
    expect(p.map((x) => [x.label, x.dueDate, x.state])).toEqual([
      ["Jan 2027", "2027-02-05", "in_progress"],
      ["Dec 2026", "2027-01-05", "due"],
    ]);
  });
});
