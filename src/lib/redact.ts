/**
 * Redact sensitive numbers from statement text BEFORE it leaves the browser.
 * The rule of thumb: no legitimate budgeting datum is a 9+ digit number.
 * Amounts have decimals and stay under 9 digits; dates are 8 digits or use
 * separators. Card numbers (13–19 digits), account numbers (typically
 * 8–17), and routing numbers (9) all get masked down to their last four.
 * SSN-shaped patterns are removed entirely. Pure, shared by client and
 * server (belt and suspenders).
 */

export interface RedactionResult {
  text: string;
  redactions: number;
}

// Either a contiguous run of 9+ digits, or separator-grouped digits where
// every group is 3–6 long (card/account/Amex styles). Requiring ≥3 digits
// per group stops the match from bleeding into an adjacent date — PDF text
// extraction joins lines with spaces, so "…5678 9010 07/01 NETFLIX" must
// mask the card and leave the date alone.
const LONG_NUMBER = /\b\d{9,}\b|\b\d{3,6}(?:[ -]\d{3,6})+\b/g;
// SSN: 3-2-4 with separators — full removal, no last-four courtesy.
const SSN = /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g;

export function redactSensitive(raw: string): RedactionResult {
  let redactions = 0;

  let text = raw.replace(SSN, () => {
    redactions += 1;
    return "[redacted]";
  });

  text = text.replace(LONG_NUMBER, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 9) return match;
    redactions += 1;
    return `••••${digits.slice(-4)}`;
  });

  return { text, redactions };
}
