import { describe, expect, it } from "vitest";
import { csvDateToISO, extractSpends, guessColumn, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("splits rows and cells, skipping blank lines", () => {
    expect(parseCsv("a,b,c\n1,2,3\n\n4,5,6\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles quoted fields with commas, quotes, and newlines", () => {
    const rows = parseCsv('date,desc,amt\r\n07/15/2026,"McDonald\'s, #42 ""drive-thru""\nlate night",-12.50');
    expect(rows[1][1]).toBe("McDonald's, #42 \"drive-thru\"\nlate night");
    expect(rows[1][2]).toBe("-12.50");
  });
});

describe("csvDateToISO", () => {
  it("accepts ISO, US slashes, and 2-digit years", () => {
    expect(csvDateToISO("2026-07-15")).toBe("2026-07-15");
    expect(csvDateToISO("07/15/2026")).toBe("2026-07-15");
    expect(csvDateToISO("7/5/26")).toBe("2026-07-05");
  });

  it("rejects garbage", () => {
    expect(csvDateToISO("yesterday")).toBeNull();
    expect(csvDateToISO("")).toBeNull();
  });
});

describe("guessColumn", () => {
  it("finds bank-style headers case-insensitively, by priority", () => {
    const headers = ["Posted Date", "Description", "Amount"];
    expect(guessColumn(headers, ["date", "posted"])).toBe(0);
    expect(guessColumn(headers, ["description", "merchant"])).toBe(1);
    expect(guessColumn(headers, ["amount", "debit"])).toBe(2);
    expect(guessColumn(headers, ["nothing"])).toBe(-1);
  });
});

describe("extractSpends", () => {
  const body = [
    ["07/15/2026", "McDonald's", "-12.50"],
    ["07/16/2026", "Paycheck", "1,000.00"], // a deposit
    ["07/17/2026", "Refund", "25.00"], // money back
    ["bad-date", "Mystery", "-5.00"],
    ["07/18/2026", "", "-9.99"], // no description
    ["07/19/2026", "Gas", "-$40.00"], // currency symbol
  ];
  const cols = { date: 0, name: 1, amount: 2 };

  it("keeps only spending; deposits, refunds, and broken rows are skipped", () => {
    const spends = extractSpends(body, cols, true);
    expect(spends).toEqual([
      { name: "McDonald's", amount: 12.5, due_date: "2026-07-15" },
      { name: "Gas", amount: 40, due_date: "2026-07-19" },
    ]);
  });

  it("flipping the sign convention flips what counts as spending", () => {
    const spends = extractSpends(body, cols, false);
    expect(spends.map((s) => s.name)).toEqual(["Paycheck", "Refund"]);
  });
});
