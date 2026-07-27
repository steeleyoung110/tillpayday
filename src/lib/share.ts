/**
 * Parse text shared into the app (Web Share Target) into a quick-spend
 * prefill: pull out an amount if one is present, use the rest as the name.
 */

export interface SharedSpend {
  name: string;
  /** String form ready for the amount input ("" when none found). */
  amount: string;
}

export function parseSharedSpend(raw: string): SharedSpend {
  const text = raw.replace(/https?:\/\/\S+/g, " ").trim();

  // Prefer a $-prefixed amount; fall back to the first cents-bearing number.
  const dollar = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  const cents = text.match(/(?<![\d.])(\d{1,6}\.\d{2})(?!\d)/);
  const hit = dollar ?? cents;
  const amount = hit ? hit[1].replace(/,/g, "") : "";

  const name = text
    .replace(hit?.[0] ?? "", " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  return { name: name || "Shared spend", amount };
}
