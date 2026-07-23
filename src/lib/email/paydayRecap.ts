/**
 * Payday recap email — the celebration screen, in inbox form. Pure builder:
 * recap numbers in, {subject, html, text} out. Uses the Till Payday brand
 * colors (deep teal / gold / cream) with inline styles, since email clients
 * ignore stylesheets.
 */
import type { PaydayRecap } from "@/lib/engine";
import type { EmailMessage } from "./send";

const TEAL = "#123F3C";
const GOLD = "#E4A93C";
const CREAM = "#F4EEE1";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function buildPaydayRecapEmail(
  to: string,
  name: string,
  recap: PaydayRecap,
  /** Savings goal amount (0 = no goal set). */
  goal: number,
): EmailMessage {
  const sweptLine =
    recap.swept > 0
      ? `You didn't spend ${currency.format(recap.swept)} last cycle — it's in savings now.`
      : recap.swept < 0
        ? `Last cycle ran ${currency.format(Math.abs(recap.swept))} over — savings covered it. Fresh buckets, fresh start.`
        : "Right on budget last cycle. Your buckets are refilled.";

  const pct =
    goal > 0
      ? Math.min(100, Math.max(0, (recap.savingsTotal / goal) * 100))
      : 0;
  const goalLine =
    goal > 0
      ? `${Math.floor(pct)}% of your ${currency.format(goal)} savings goal`
      : null;

  const subject =
    recap.swept > 0
      ? `🎉 Payday! You banked ${currency.format(recap.swept)}`
      : "🎉 Payday! Your buckets are refilled";

  const text = [
    `Payday! ${prettyDate(recap.payday)}`,
    "",
    `Hi ${name},`,
    "",
    sweptLine,
    `New savings total: ${currency.format(recap.savingsTotal)}`,
    ...(goalLine ? [goalLine] : []),
    "",
    "Keep going — Till Payday",
  ].join("\n");

  const goalHtml = goalLine
    ? `<div style="margin-top:16px">
         <div style="background:#0d2f2c;border-radius:999px;height:10px;overflow:hidden">
           <div style="background:${GOLD};height:10px;width:${pct.toFixed(0)}%"></div>
         </div>
         <p style="margin:8px 0 0;font-size:13px;color:${CREAM};opacity:.8">${goalLine}</p>
       </div>`
    : "";

  const html = `
  <div style="background:${TEAL};padding:32px 16px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
    <div style="max-width:480px;margin:0 auto;background:#0d2f2c;border-radius:16px;padding:32px;text-align:center">
      <p style="font-size:44px;margin:0">🎉</p>
      <h1 style="color:${CREAM};font-size:28px;margin:8px 0 4px">Payday!</h1>
      <p style="color:${CREAM};opacity:.7;font-size:14px;margin:0">${prettyDate(recap.payday)}</p>
      <p style="color:${CREAM};font-size:17px;line-height:1.5;margin:24px 0 0">${sweptLine}</p>
      <div style="background:${TEAL};border-radius:12px;padding:20px;margin-top:24px">
        <p style="color:${CREAM};opacity:.7;font-size:13px;margin:0">New savings total</p>
        <p style="color:${GOLD};font-size:36px;font-weight:800;margin:6px 0 0">${currency.format(recap.savingsTotal)}</p>
        ${goalHtml}
      </div>
      <p style="color:${CREAM};opacity:.6;font-size:13px;margin:24px 0 0">Keep going — Till Payday</p>
    </div>
  </div>`;

  return { to, subject, html, text };
}
