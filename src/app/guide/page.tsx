import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { LegalFooter } from "@/components/LegalFooter";

/**
 * The guide: 90+ features organized by the question you're actually asking.
 * Static on purpose — a map, not another dashboard.
 */

const SECTIONS: { title: string; items: [string, string, string][] }[] = [
  {
    title: "Everyday questions",
    items: [
      ["Can I spend money today?", "The big number at the top — safe-to-spend per day. Tap “why did my number change?” for the receipt.", "/"],
      ["Can I afford this specific thing?", "“Can I afford…” box on the Dashboard — type the price, get yes / yes-but / no.", "/"],
      ["How do I log a spend fast?", "One-tap preset chips, the Log-a-spend card, or Ctrl+K and type “12.50 mcdonalds”.", "/"],
      ["When does money get tight?", "The Danger Day tile names the exact day — and the money calendar draws the whole month.", "/budget"],
      ["What's coming out of my next check?", "Next-payday preview, with “adjust this check once” for one-off changes.", "/"],
    ],
  },
  {
    title: "Keeping it honest",
    items: [
      ["Does the app match my real bank?", "Reality check 🏦 — type your bank balance, book the drift, stay honest.", "/"],
      ["Did I log something twice?", "The duplicate guard flags same-merchant-same-amount-same-day pairs automatically.", "/"],
      ["Am I estimating instead of logging?", "The round-number check on Budget notices when too many logs end in .00.", "/budget"],
      ["Where does my money actually go?", "Merchant leaderboard, day-by-day heatmap, six-month trends — all on Budget.", "/budget"],
      ["Are my own prices rising?", "Your personal inflation — computed from YOUR repeat purchases and bills.", "/budget"],
    ],
  },
  {
    title: "Bills",
    items: [
      ["Which check covers which bill?", "“Which check covers what” groups every upcoming bill under its paycheck.", "/budget"],
      ["A bill renews soon — should I shop it?", "Set a renewal date on any bill; you get a nudge 30 days out.", "/budget"],
      ["Are my due dates hurting me?", "The due-date optimizer names the bill to move and what it buys you.", "/budget"],
      ["Autopay or manual?", "Classify each bill; manual ones get pay-it reminders, autopay ones get did-it-charge checks.", "/budget"],
      ["Which month is my heaviest?", "The bill terrain shows 12 months of scheduled bills — mountains and all.", "/budget"],
      ["Splitting rent with roommates?", "Split any bill ÷N — your projections use YOUR share, and the ledger tracks the rest.", "/budget"],
    ],
  },
  {
    title: "Growing money",
    items: [
      ["How healthy is my budget overall?", "The health score: five honest components, weakest one called out.", "/"],
      ["How long would I last without income?", "Runway on the Dashboard; the full worst-case plan lives in Crisis mode.", "/crisis"],
      ["How big should my emergency fund be?", "The emergency fund card sizes it from your REAL bills.", "/"],
      ["When am I debt-free?", "“Your debt, honestly” — payoff dates, milestones vs your peak, refinance math in Grow.", "/grow"],
      ["Is my savings account lazy?", "The lazy-money card compares your APY to ~4% in missed dollars.", "/net-worth"],
      ["How free am I, really?", "Freedom Day (this month) on the Dashboard; financial freedom % on Net worth.", "/net-worth"],
      ["What's my net worth heading toward?", "The milestone forecast names dates — including crossing $0.", "/net-worth"],
    ],
  },
  {
    title: "Habits & rituals",
    items: [
      ["The 2-minute weekly review", "What left, what's coming, one thing to skip. Streaks tracked.", "/review"],
      ["Challenges", "No-spend week, the 52-week ladder, and the skip-it jar.", "/budget"],
      ["Round-up rule", "Every logged spend rounds up; the change banks itself. Turn it on in Settings.", "/settings"],
      ["Month & year report cards", "Wrapped: grades against your own plan, plus the annual interest ledger.", "/wrapped"],
      ["Sharing with a partner", "Read-only or can-log-spending — every partner entry is attributed.", "/settings"],
      ["Your data, yours", "CSV export, full JSON backup, statement import, and wipe-everything — all in Settings.", "/settings"],
    ],
  },
];

export default function GuidePage() {
  return (
    <AppShell active="settings">
      <div className="mx-auto max-w-4xl space-y-6 px-6 pt-6">
        <div>
          <h1 className="text-2xl font-black text-white">What&apos;s in here 🗺️</h1>
          <p className="mt-1 text-sm text-slate-400">
            Till Payday by the question you&apos;re actually asking. Everything
            below is computed from your own numbers — no ads, no upsells, no
            bank logins.
          </p>
        </div>
        {SECTIONS.map((s) => (
          <div key={s.title} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold text-white">{s.title}</h2>
            <ul className="mt-3 space-y-2">
              {s.items.map(([q, a, href]) => (
                <li key={q} className="rounded-lg bg-slate-800/60 px-3 py-2">
                  <Link href={href} className="group block">
                    <p className="text-sm font-semibold text-slate-200 transition group-hover:text-emerald-300">
                      {q}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">{a}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-xs text-slate-600">
          Missing something? There&apos;s a suggestion box in{" "}
          <Link href="/settings" className="text-sky-300 hover:text-sky-200">
            Settings
          </Link>
          {" — it lands straight in front of the person building this."}
        </p>
      </div>
      <LegalFooter />
    </AppShell>
  );
}
