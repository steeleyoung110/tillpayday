import { describe, expect, it } from "vitest";
import { redactSensitive } from "./redact";

describe("redactSensitive", () => {
  it("masks card numbers in every common formatting, keeping last four", () => {
    const r = redactSensitive(
      "Card 4111 1111 1111 1111 and also 4111-1111-1111-1234 and 4111111111119999",
    );
    expect(r.text).toContain("••••1111");
    expect(r.text).toContain("••••1234");
    expect(r.text).toContain("••••9999");
    expect(r.text).not.toContain("4111");
    expect(r.redactions).toBe(3);
  });

  it("masks account and routing numbers (9+ digits)", () => {
    const r = redactSensitive("Account: 002348871934 Routing: 211370545");
    expect(r.text).toContain("••••1934");
    expect(r.text).toContain("••••0545");
    expect(r.redactions).toBe(2);
  });

  it("removes SSN patterns entirely — no last-four courtesy", () => {
    const r = redactSensitive("SSN 123-45-6789 on file");
    expect(r.text).toContain("[redacted]");
    expect(r.text).not.toContain("6789");
  });

  it("leaves dates, amounts, and merchant text alone", () => {
    const src =
      "07/14/2026 MCDONALD'S #4471 $12.50\n2026-07-15 SHELL OIL 1023 $45.00\nBalance 1,234.56";
    const r = redactSensitive(src);
    expect(r.text).toBe(src);
    expect(r.redactions).toBe(0);
  });

  it("does not bleed into a date that follows a card number on the same line", () => {
    // PDF text extraction joins lines with spaces, so this shape is common.
    const r = redactSensitive("Account Number: 4400 1234 5678 9010 07/01 NETFLIX.COM $15.49");
    expect(r.text).toBe("Account Number: ••••9010 07/01 NETFLIX.COM $15.49");
    expect(r.redactions).toBe(1);
  });

  it("statement-shaped mixed content: masks the account line, keeps the charges", () => {
    const r = redactSensitive(
      "Account Number: 4400 1234 5678 9010\n07/01 NETFLIX.COM $15.49\n07/03 KROGER #221 $84.12",
    );
    expect(r.text).toContain("••••9010");
    expect(r.text).toContain("NETFLIX.COM $15.49");
    expect(r.text).toContain("KROGER #221 $84.12");
    expect(r.redactions).toBe(1);
  });
});
