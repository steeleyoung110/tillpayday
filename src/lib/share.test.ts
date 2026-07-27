import { describe, expect, it } from "vitest";
import { parseSharedSpend } from "./share";

describe("parseSharedSpend", () => {
  it("pulls a $-amount and uses the rest as the name", () => {
    expect(parseSharedSpend("McDonald's $12.50 drive-thru")).toEqual({
      name: "McDonald's drive-thru",
      amount: "12.50",
    });
  });

  it("handles thousands separators and bare cents-bearing numbers", () => {
    expect(parseSharedSpend("Flight receipt $1,234.56")).toEqual({
      name: "Flight receipt",
      amount: "1234.56",
    });
    expect(parseSharedSpend("Gas station 40.00 total")).toEqual({
      name: "Gas station total",
      amount: "40.00",
    });
  });

  it("strips URLs and survives text with no amount", () => {
    const r = parseSharedSpend("Look at this https://example.com/receipt/42");
    expect(r.name).toBe("Look at this");
    expect(r.amount).toBe("");
  });

  it("empty share still yields a usable name", () => {
    expect(parseSharedSpend("").name).toBe("Shared spend");
  });
});
