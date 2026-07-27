/**
 * Honest coach recap: the user's real numbers in, a no-fluff plain-English
 * monthly recap out, written by Claude. Env-gated on ANTHROPIC_API_KEY —
 * without it the route reports itself unconfigured and the UI hides the card.
 *
 * The tone contract mirrors the app's philosophy: kind wording, brutal math.
 * The model only ever sees aggregate numbers this route computes — and it is
 * explicitly instructed to use only those numbers, never invented ones.
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { computeTodayBalances } from "@/lib/balances";
import { getDashboardData, getNetWorthData } from "@/lib/data";
import {
  cycleHistory,
  cycleSpending,
  runway,
  spendAnomalies,
} from "@/lib/engine";
import {
  bucketToEngine,
  expenseToEngine,
  incomeToEngine,
} from "@/lib/rows";
import { auditSubscriptions } from "@/lib/subscriptions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SYSTEM = `You are the recap writer for Till Payday, an educational budgeting app. Your one rule: kind wording, brutal math. The user believes honest reflection is the only thing that changes behavior — flattery and softening help nobody.

Write a short recap (under 300 words) of the user's recent money picture using ONLY the numbers provided. Never invent, estimate, or extrapolate figures that aren't in the data. If the data is thin, say so plainly.

Structure: (1) what actually happened, numbers first; (2) the pattern forming, if any — over-plan streaks, anomalies, runway direction; (3) the one change that would matter most next cycle. No bullet-point walls — write it like a sharp, caring friend. No praise unless the numbers earn it; when they do, one sentence. Never call a bad picture "okay". This is education, not financial advice, and you don't give investment recommendations.`;

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, reason: "Unconfigured: set ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Not signed in" }, { status: 401 });
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  const [data, nw] = await Promise.all([getDashboardData(), getNetWorthData()]);
  const engineIncome = data.income.map(incomeToEngine);
  const engineBuckets = data.buckets.map(bucketToEngine);
  const engineExpenses = data.expenses.map(expenseToEngine);

  const accountCreatedISO = (user.created_at ?? todayISO).slice(0, 10);
  const cycles = cycleHistory(engineIncome, engineBuckets, engineExpenses, todayISO, 6)
    .cycles.filter((c) => c.cycleStart >= accountCreatedISO);
  const spend = cycleSpending(engineIncome, engineExpenses, todayISO);
  const balances = computeTodayBalances(data, todayISO);
  const liquid = balances
    ? Math.round(Object.values(balances).reduce((s, v) => s + v, 0) * 100) / 100
    : 0;
  const run = runway(liquid, cycles);
  const anomalies = spendAnomalies(spend, cycles);
  const subs = auditSubscriptions(data.expenses, data.buckets, data.income);
  const debts = nw.liabilities
    .filter((l) => !l.is_archived && Number(l.current_balance) > 0)
    .map((l) => ({
      name: l.name,
      balance: Number(l.current_balance),
      ratePercent: l.interest_rate !== null ? Number(l.interest_rate) : null,
      monthlyPayment: Number(l.minimum_payment),
    }));

  const numbers = {
    today: todayISO,
    savingsAndBucketsOnHandTotal: liquid,
    savingsBalance: balances?.[""] ?? null,
    runway: run
      ? { daysIfIncomeStopped: run.days, avgDailySpend: run.avgDailySpend }
      : null,
    currentCycle: spend
      ? { since: spend.since, spentSoFar: spend.total, nextPayday: spend.nextPayday }
      : null,
    completedCycles: cycles.map((c) => ({
      from: c.cycleStart,
      to: c.cycleEnd,
      paycheck: c.paycheckTotal,
      spent: c.totalActual,
      keptPlan: c.keptPlan,
      overBuckets: c.buckets
        .filter((b) => b.overBy > 0)
        .map((b) => ({ bucket: b.bucketName, planned: b.planned, actual: b.actual })),
    })),
    anomaliesThisCycle: anomalies.map((a) => ({
      bucket: a.bucketName,
      spentSoFar: a.current,
      yourUsualFullCycle: a.average,
      pctAboveUsual: a.pctAbove,
    })),
    repeatingBillsYearlyTotal: subs.yearlyTotal,
    repeatingBillsPctOfIncome: subs.pctOfIncome,
    debts,
  };

  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: "claude-opus-5",
    max_tokens: 4096,
    // Safety classifiers can decline a request; the server-side fallback
    // re-runs it on Anthropic's recommended substitute model automatically.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Here are my Till Payday numbers as JSON. Write my recap.\n\n${JSON.stringify(numbers, null, 2)}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    return NextResponse.json(
      { ok: false, reason: "The recap writer declined this request — try again later." },
      { status: 502 },
    );
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) {
    return NextResponse.json(
      { ok: false, reason: "Empty recap — try again." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, recap: text });
}
