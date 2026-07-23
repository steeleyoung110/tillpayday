import { describe, expect, it } from "vitest";
import {
  presetLabel,
  presetWindow,
  sampleWindow,
  sanitizeWindow,
  windowPlan,
} from "./chartWindow";

const TODAY = "2026-07-24";

describe("presetWindow / presetLabel", () => {
  it("spans today to today+N months", () => {
    expect(presetWindow(TODAY, 1)).toEqual({ from: TODAY, to: "2026-08-24" });
    expect(presetWindow(TODAY, 60)).toEqual({ from: TODAY, to: "2031-07-24" });
  });

  it("labels presets in months under a year, years after", () => {
    expect(presetLabel(1)).toBe("1 month");
    expect(presetLabel(3)).toBe("3 months");
    expect(presetLabel(12)).toBe("1 year");
    expect(presetLabel(120)).toBe("10 years");
  });
});

describe("sanitizeWindow", () => {
  it("clamps a past start to today (the sim has no past)", () => {
    expect(sanitizeWindow("2020-01-01", "2026-09-01", TODAY)).toEqual({
      from: TODAY,
      to: "2026-09-01",
    });
  });

  it("forces the end after the start", () => {
    const w = sanitizeWindow("2026-09-01", "2026-08-01", TODAY);
    expect(w).toEqual({ from: "2026-09-01", to: "2026-10-01" });
  });

  it("caps the end at 10 years out", () => {
    expect(sanitizeWindow(TODAY, "2099-01-01", TODAY).to).toBe("2036-07-24");
  });

  it("fills sensible defaults for empty inputs", () => {
    expect(sanitizeWindow("", "", TODAY)).toEqual({
      from: TODAY,
      to: "2031-07-24", // 5 years
    });
  });
});

describe("windowPlan", () => {
  it("samples daily with day labels when zoomed to a month", () => {
    const p = windowPlan(presetWindow(TODAY, 1), TODAY);
    expect(p.stepDays).toBe(1);
    expect(p.granularity).toBe("day");
    expect(p.monthsToProject).toBe(1);
  });

  it("samples every 3 days for a quarter, still day-labeled", () => {
    const p = windowPlan(presetWindow(TODAY, 3), TODAY);
    expect(p.stepDays).toBe(3);
    expect(p.granularity).toBe("day");
  });

  it("samples weekly with month labels for a year", () => {
    const p = windowPlan(presetWindow(TODAY, 12), TODAY);
    expect(p.stepDays).toBe(7);
    expect(p.granularity).toBe("monthYear"); // Jul '26 → Jul '27 crosses years
    expect(p.monthsToProject).toBe(12);
  });

  it("samples monthly for a decade", () => {
    const p = windowPlan(presetWindow(TODAY, 120), TODAY);
    expect(p.stepDays).toBe(30);
    expect(p.granularity).toBe("monthYear");
    expect(p.monthsToProject).toBe(120);
  });

  it("projects enough months to cover a future-start custom window", () => {
    const p = windowPlan({ from: "2027-01-01", to: "2027-03-15" }, TODAY);
    expect(p.monthsToProject).toBe(8); // today+8mo = 2027-03-24 ≥ Mar 15
    expect(p.stepDays).toBe(3); // ~73 days → every-3-days band
  });
});

describe("sampleWindow", () => {
  const mk = (n: number, start = "2026-07-24") => {
    const d0 = new Date(`${start}T00:00:00Z`).getTime();
    return Array.from({ length: n }, (_, i) => ({
      date: new Date(d0 + i * 86_400_000).toISOString().slice(0, 10),
    }));
  };

  it("keeps only points inside the window", () => {
    const pts = mk(100);
    const out = sampleWindow(pts, { from: "2026-08-01", to: "2026-08-10" }, 1);
    expect(out[0].date).toBe("2026-08-01");
    expect(out[out.length - 1].date).toBe("2026-08-10");
    expect(out).toHaveLength(10);
  });

  it("thins by step but always keeps the last point", () => {
    const pts = mk(30);
    const out = sampleWindow(pts, { from: "2026-07-24", to: "2026-08-22" }, 7);
    expect(out.map((p) => p.date)).toContain("2026-08-22"); // last kept
    expect(out.length).toBeLessThan(10);
  });
});
