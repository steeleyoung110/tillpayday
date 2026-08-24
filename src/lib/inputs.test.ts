import { describe, expect, it } from "vitest";
import { formatMoneyInput, parseMoneyInput, toMoneyDisplay } from "./moneyInput";
import { daysFromToday, prettyDate, relativeDay, relativeDayWithDate } from "./relativeDate";

describe("formatMoneyInput", () => {
  it("groups thousands as you type", () => {
    expect(formatMoneyInput("1234")).toBe("1,234");
    expect(formatMoneyInput("1234567")).toBe("1,234,567");
    expect(formatMoneyInput("12")).toBe("12");
  });

  it("keeps a trailing dot mid-typing instead of eating it", () => {
    expect(formatMoneyInput("1234.")).toBe("1,234.");
    expect(formatMoneyInput("12.5")).toBe("12.5");
  });

  it("caps cents at two places rather than rounding the keystroke away", () => {
    expect(formatMoneyInput("12.567")).toBe("12.56");
    expect(formatMoneyInput("0.999")).toBe("0.99");
  });

  it("handles a leading dot, stray characters, and extra dots", () => {
    expect(formatMoneyInput(".5")).toBe("0.5");
    expect(formatMoneyInput("$1,2a3b4")).toBe("1,234");
    expect(formatMoneyInput("1.2.3")).toBe("1.23");
  });

  it("strips leading zeros but keeps a lone zero", () => {
    expect(formatMoneyInput("007")).toBe("7");
    expect(formatMoneyInput("0")).toBe("0");
    expect(formatMoneyInput("0.25")).toBe("0.25");
  });

  it("empty stays empty so placeholders still show", () => {
    expect(formatMoneyInput("")).toBe("");
  });
});

describe("parseMoneyInput", () => {
  it("submits a plain number, commas stripped", () => {
    expect(parseMoneyInput("1,234.56")).toBe("1234.56");
    expect(parseMoneyInput("12")).toBe("12");
    expect(parseMoneyInput("1,234.")).toBe("1234");
  });

  it("returns empty for nothing meaningful, so `required` still fires", () => {
    expect(parseMoneyInput("")).toBe("");
    expect(parseMoneyInput(".")).toBe("");
  });
});

describe("toMoneyDisplay", () => {
  it("formats a stored number for an initial value", () => {
    expect(toMoneyDisplay(1234.5)).toBe("1,234.5");
    expect(toMoneyDisplay("950")).toBe("950");
    expect(toMoneyDisplay(null)).toBe("");
    expect(toMoneyDisplay(undefined)).toBe("");
  });
});

describe("relativeDay", () => {
  const TODAY = "2026-08-03";

  it("names the near days in words", () => {
    expect(relativeDay("2026-08-03", TODAY)).toBe("today");
    expect(relativeDay("2026-08-04", TODAY)).toBe("tomorrow");
    expect(relativeDay("2026-08-02", TODAY)).toBe("yesterday");
  });

  it("counts days ahead and behind", () => {
    expect(relativeDay("2026-08-09", TODAY)).toBe("in 6 days");
    expect(relativeDay("2026-07-28", TODAY)).toBe("6 days ago");
  });

  it("switches to weeks then months so nobody reads 'in 84 days'", () => {
    expect(relativeDay("2026-09-02", TODAY)).toBe("in 4 weeks");
    expect(relativeDay("2026-10-26", TODAY)).toBe("in 3 months");
  });

  it("keeps the calendar date as an aside when it's needed", () => {
    expect(relativeDayWithDate("2026-08-09", TODAY)).toBe("in 6 days (Aug 9)");
  });

  it("daysFromToday is signed and whole", () => {
    expect(daysFromToday("2026-08-09", TODAY)).toBe(6);
    expect(daysFromToday("2026-07-28", TODAY)).toBe(-6);
  });
});

describe("prettyDate", () => {
  it("drops the year within this year and keeps it otherwise", () => {
    expect(prettyDate("2026-08-15", "2026-08-03")).toBe("Aug 15");
    expect(prettyDate("2027-01-04", "2026-08-03")).toBe("Jan 4, 2027");
  });
});
