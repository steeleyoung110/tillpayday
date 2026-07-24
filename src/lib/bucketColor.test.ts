import { describe, expect, it } from "vitest";
import {
  UNSPENT_GREEN,
  classifyBucket,
  planColor,
  spentRed,
} from "./bucketColor";

describe("classifyBucket", () => {
  it("maps Steele's requested palette: savings green, food yellow, bills orange, fun red", () => {
    expect(classifyBucket("Savings", { isSavings: true })).toBe("savings");
    expect(classifyBucket("Food")).toBe("food");
    expect(classifyBucket("Bills")).toBe("bills");
    expect(classifyBucket("Fun Money")).toBe("fun");
  });

  it("new buckets self-classify by meaning", () => {
    expect(classifyBucket("Index funds")).toBe("investment"); // green-ish
    expect(classifyBucket("Retirement 401k")).toBe("investment");
    expect(classifyBucket("Groceries")).toBe("food");
    expect(classifyBucket("Rent")).toBe("bills");
    expect(classifyBucket("Car insurance")).toBe("bills");
    expect(classifyBucket("Concert fund")).toBe("fun");
    expect(classifyBucket("Impulse buys")).toBe("fun"); // useless habit → red
    expect(classifyBucket("Vacation trip")).toBe("fun");
  });

  it("unlabeled flexible money counts as fun; true unknowns land mid-spectrum", () => {
    expect(classifyBucket("Misc", { isFlexible: true })).toBe("fun");
    expect(classifyBucket("Misc")).toBe("other");
  });

  it("savings flag beats any name", () => {
    expect(classifyBucket("Fun Money", { isSavings: true })).toBe("savings");
  });
});

describe("colors", () => {
  it("families get distinct shades per bucket, brightest first", () => {
    expect(planColor("savings", 0)).toBe("#22c55e"); // bright green
    expect(planColor("food", 0)).toBe("#eab308"); // yellow
    expect(planColor("bills", 0)).toBe("#f97316"); // orange
    expect(planColor("fun", 0)).toBe("#ef4444"); // red
    expect(planColor("fun", 0)).not.toBe(planColor("fun", 1));
  });

  it("spent shades are all distinct reds; unspent is green", () => {
    const reds = [0, 1, 2, 3, 4, 5].map(spentRed);
    expect(new Set(reds).size).toBe(6);
    for (const r of reds) expect(r).toMatch(/^#(e|f|d|b)/i); // warm red family
    expect(UNSPENT_GREEN).toBe("#22c55e");
  });
});
