"use client";

/**
 * The Grow tab (phase 10): how compounding works for and against you.
 * Three modes, all instant client-side math — chart first, words second.
 * Teacher, not lecturer; math on the numbers you enter, nothing more.
 */
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  amortize,
  debtVsInvest,
  loanPayoff,
  padCurve,
  savingsGrowth,
  type AmortRow,
  type CurvePoint,
} from "@/lib/grow";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

// Validated palette pair (CVD-safe on the dark surface).
const COLOR_A = "#3987e5";
const COLOR_B = "#d55181";

export interface LoanPrefill {
  id: string;
  name: string;
  balance: number;
  rate: number | null;
}

type Mode = "loan" | "save" | "versus";

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400";

function fmtMonths(m: number): string {
  const y = Math.floor(m / 12);
  const rest = m % 12;
  if (y === 0) return `${m} month${m === 1 ? "" : "s"}`;
  if (rest === 0) return `${y} year${y === 1 ? "" : "s"}`;
  return `${y} yr ${rest} mo`;
}

function Field({
  label,
  value,
  onChange,
  step = "0.01",
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: string;
  suffix?: string;
}) {
  return (
    <label className="text-xs text-slate-400">
      {label}
      {suffix && <span className="text-slate-500">{` (${suffix})`}</span>}
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${inputCls} mt-1`}
      />
    </label>
  );
}

interface MonthWindow {
  from: number | null;
  to: number | null;
}

function Curves({
  a,
  b,
  nameA,
  nameB,
  showZero = false,
  window,
  payoffDots = [],
  celebrateMonth = null,
}: {
  a: CurvePoint[];
  b: CurvePoint[];
  nameA: string;
  nameB: string;
  showZero?: boolean;
  window?: MonthWindow;
  /** Dots marking where a curve hits $0 (loan payoff moments). */
  payoffDots?: { month: number; value: number; color: string }[];
  /** Vertical "🎉 debt-free here" marker at this month. */
  celebrateMonth?: number | null;
}) {
  const byMonth = new Map<number, { month: number; a?: number; b?: number }>();
  for (const p of a) byMonth.set(p.month, { month: p.month, a: p.value });
  for (const p of b) {
    const row = byMonth.get(p.month) ?? { month: p.month };
    row.b = p.value;
    byMonth.set(p.month, row);
  }
  let data = [...byMonth.values()].sort((x, y) => x.month - y.month);
  // Optional zoom: look closely at the beginning, the end, any slice.
  const from = window?.from ?? null;
  const to = window?.to ?? null;
  if (from !== null || to !== null) {
    data = data.filter(
      (d) => (from === null || d.month >= from) && (to === null || d.month <= to),
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#1e293b" vertical={false} />
          {showZero && <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1.5} />}
          {celebrateMonth !== null && (
            <ReferenceLine
              x={celebrateMonth}
              stroke="#34d399"
              strokeDasharray="4 4"
              label={{
                value: "🎉 debt-free here",
                position: "insideTop",
                fill: "#34d399",
                fontSize: 12,
              }}
            />
          )}
          {payoffDots.map((d) => (
            <ReferenceDot
              key={`${d.month}-${d.color}`}
              x={d.month}
              y={d.value}
              r={5}
              fill={d.color}
              stroke="#0f172a"
              strokeWidth={2}
            />
          ))}
          <XAxis
            dataKey="month"
            tickFormatter={(m: number) =>
              m === 0 ? "now" : m % 12 === 0 ? `${m / 12}y` : `${m}mo`
            }
            interval="preserveStartEnd"
            minTickGap={50}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={{ stroke: "#334155" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => currency.format(v)}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={78}
          />
          <Tooltip
            formatter={(value, name) => [
              currency.format(Number(value)),
              name === "a" ? nameA : nameB,
            ]}
            labelFormatter={(m) => (Number(m) === 0 ? "now" : fmtMonths(Number(m)))}
            labelStyle={{ color: "#e2e8f0" }}
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "0.5rem",
            }}
          />
          <Legend
            formatter={(value: string) => (
              <span className="text-sm text-slate-300">
                {value === "a" ? nameA : nameB}
              </span>
            )}
          />
          <Line type="monotone" dataKey="a" stroke={COLOR_A} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="b" stroke={COLOR_B} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Virtue-spectrum: principal is money becoming yours, interest is money gone.
const PRINCIPAL_GREEN = "#22c55e";
const INTEREST_RED = "#ef4444";

/**
 * Stacked view of each monthly payment: the green slice reduces your balance,
 * the red slice is the bank's. The band's total height is the payment itself,
 * so watching red shrink IS watching interest lose its grip.
 */
function PaymentSplitChart({
  schedule,
  crossoverMonth,
  window,
}: {
  schedule: AmortRow[];
  crossoverMonth: number | null;
  window?: MonthWindow;
}) {
  const from = window?.from ?? null;
  const to = window?.to ?? null;
  const data =
    from !== null || to !== null
      ? schedule.filter(
          (d) => (from === null || d.month >= from) && (to === null || d.month <= to),
        )
      : schedule;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#1e293b" vertical={false} />
          {crossoverMonth !== null &&
            (from === null || crossoverMonth >= from) &&
            (to === null || crossoverMonth <= to) && (
              <ReferenceLine
                x={crossoverMonth}
                stroke="#34d399"
                strokeDasharray="4 4"
                label={{
                  value: "most of it finally goes to you",
                  position: "insideTop",
                  fill: "#34d399",
                  fontSize: 12,
                }}
              />
            )}
          <XAxis
            dataKey="month"
            tickFormatter={(m: number) => (m % 12 === 0 ? `${m / 12}y` : `${m}mo`)}
            interval="preserveStartEnd"
            minTickGap={50}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={{ stroke: "#334155" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => currency.format(v)}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={78}
          />
          <Tooltip
            formatter={(value, name) => [
              currency.format(Number(value)),
              name === "principal" ? "To your balance (principal)" : "To the bank (interest)",
            ]}
            labelFormatter={(m) => `Payment ${m} — ${fmtMonths(Number(m))} in`}
            labelStyle={{ color: "#e2e8f0" }}
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "0.5rem",
            }}
          />
          <Legend
            formatter={(value: string) => (
              <span className="text-sm text-slate-300">
                {value === "principal" ? "To your balance" : "To the bank"}
              </span>
            )}
          />
          <Area
            type="monotone"
            dataKey="principal"
            stackId="pay"
            stroke={PRINCIPAL_GREEN}
            fill={PRINCIPAL_GREEN}
            fillOpacity={0.55}
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="interest"
            stackId="pay"
            stroke={INTEREST_RED}
            fill={INTEREST_RED}
            fillOpacity={0.55}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Verdict({ children, tone = "calm" }: { children: React.ReactNode; tone?: "calm" | "warn" }) {
  return (
    <div
      className={`mt-4 rounded-xl border p-4 text-sm ${
        tone === "warn"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
          : "border-sky-500/40 bg-sky-500/10 text-sky-100"
      }`}
    >
      {children}
    </div>
  );
}

function PrefillChips({
  prefills,
  onPick,
}: {
  prefills: LoanPrefill[];
  onPick: (p: LoanPrefill) => void;
}) {
  if (prefills.length === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-500">Use one of yours:</span>
      {prefills.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onPick(p)}
          className="rounded-full border border-slate-600 px-3 py-1 text-slate-300 transition hover:border-emerald-400 hover:text-white"
        >
          {`${p.name} — ${currency.format(p.balance)}${p.rate ? ` @ ${p.rate}%` : ""}`}
        </button>
      ))}
    </div>
  );
}

export function GrowTab({ prefills }: { prefills: LoanPrefill[] }) {
  const [mode, setMode] = useState<Mode>("loan");

  // Zoom window shared by the loan and head-to-head charts ("" = show all).
  const [zoomFrom, setZoomFrom] = useState("");
  const [zoomTo, setZoomTo] = useState("");
  const monthWindow: MonthWindow = {
    from: zoomFrom !== "" && Number(zoomFrom) >= 0 ? Number(zoomFrom) : null,
    to: zoomTo !== "" && Number(zoomTo) > 0 ? Number(zoomTo) : null,
  };
  const zoomControls = (
    <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-400">
      <label>
        Zoom in — from month
        <input
          type="number"
          inputMode="numeric"
          min="0"
          placeholder="start"
          value={zoomFrom}
          onChange={(e) => setZoomFrom(e.target.value)}
          className={`${inputCls} mt-1 w-24`}
        />
      </label>
      <label>
        to month
        <input
          type="number"
          inputMode="numeric"
          min="1"
          placeholder="end"
          value={zoomTo}
          onChange={(e) => setZoomTo(e.target.value)}
          className={`${inputCls} mt-1 w-24`}
        />
      </label>
      {(zoomFrom !== "" || zoomTo !== "") && (
        <button
          type="button"
          onClick={() => {
            setZoomFrom("");
            setZoomTo("");
          }}
          className="pb-2 text-sky-300 transition hover:text-sky-200"
        >
          show everything
        </button>
      )}
    </div>
  );

  // 10A
  const [loanBalance, setLoanBalance] = useState(10000);
  const [payment, setPayment] = useState(300);
  const [apr1, setApr1] = useState(10);
  const [apr2, setApr2] = useState(8);
  const [extra, setExtra] = useState(0);

  // 10B
  const [start, setStart] = useState(1000);
  const [monthly, setMonthly] = useState(200);
  const [apy1, setApy1] = useState(3);
  const [apy2, setApy2] = useState(0.4);
  const [saveYears, setSaveYears] = useState(10);

  // 10C
  const [vsExtra, setVsExtra] = useState(200);
  const [vsBalance, setVsBalance] = useState(8000);
  const [vsApr, setVsApr] = useState(24);
  const [vsReturn, setVsReturn] = useState(7);
  const [vsYears, setVsYears] = useState(15);

  const modeBtn = (m: Mode, label: string) => (
    <button
      key={m}
      onClick={() => setMode(m)}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
        mode === m
          ? "bg-emerald-500 text-slate-950"
          : "text-slate-300 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex w-fit rounded-xl border border-slate-700 p-1">
        {modeBtn("loan", "Pay off a loan")}
        {modeBtn("save", "Grow savings")}
        {modeBtn("versus", "Debt vs invest")}
      </div>

      {mode === "loan" && (() => {
        const pay = payment + extra;
        const a = loanPayoff(loanBalance, apr1, pay);
        const b = loanPayoff(loanBalance, apr2, pay);
        const split = amortize(loanBalance, apr1, pay);
        const firstSplit = split.schedule[0] ?? null;
        const baseA = extra > 0 ? loanPayoff(loanBalance, apr1, payment) : null;
        const baseB = extra > 0 ? loanPayoff(loanBalance, apr2, payment) : null;
        const anyNever = a.neverPaysOff || b.neverPaysOff;
        // Pin the timeline to the no-extra baseline: paying off early shows a
        // line diving to $0 and running flat — months of visible freedom —
        // instead of the axis shrinking to hide the win.
        const lastMonth = (pts: CurvePoint[]) => pts[pts.length - 1]?.month ?? 0;
        const horizon = Math.max(
          lastMonth(a.points),
          lastMonth(b.points),
          baseA ? lastMonth(baseA.points) : 0,
          baseB ? lastMonth(baseB.points) : 0,
        );
        const aPts = padCurve(a.points, horizon);
        const bPts = padCurve(b.points, horizon);
        return (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <PrefillChips
              prefills={prefills}
              onPick={(p) => {
                setLoanBalance(p.balance);
                if (p.rate) setApr1(p.rate);
              }}
            />
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Loan balance" value={loanBalance} onChange={setLoanBalance} />
              <Field label="Monthly payment" value={payment} onChange={setPayment} />
              <Field label="Rate A" value={apr1} onChange={setApr1} step="0.1" suffix="% APR" />
              <Field label="Rate B" value={apr2} onChange={setApr2} step="0.1" suffix="% APR" />
            </div>
            <label className="mb-4 block text-xs text-slate-400">
              {`Extra payment: +${currency.format(extra)}/month`}
              <input
                type="range"
                min="0"
                max="500"
                step="10"
                value={extra}
                onChange={(e) => setExtra(Number(e.target.value))}
                className="mt-1 w-full accent-emerald-500"
              />
            </label>
            {zoomControls}
            <Curves
              a={aPts}
              b={bPts}
              nameA={`At ${apr1}%`}
              nameB={`At ${apr2}%`}
              window={monthWindow}
              payoffDots={[
                ...(a.months !== null ? [{ month: a.months, value: 0, color: COLOR_A }] : []),
                ...(b.months !== null ? [{ month: b.months, value: 0, color: COLOR_B }] : []),
              ]}
              celebrateMonth={
                a.months !== null || b.months !== null
                  ? Math.min(a.months ?? Infinity, b.months ?? Infinity)
                  : null
              }
            />
            {anyNever ? (
              <Verdict tone="warn">
                {`⚠️ ${currency.format(pay)}/month doesn't even cover the interest at ${
                  a.neverPaysOff ? apr1 : apr2
                }% — that's ${currency.format(
                  (a.neverPaysOff ? a : b).firstMonthInterest,
                )}/month before the balance moves an inch. At this payment the balance grows forever. Nudge the payment (or the extra slider) up and watch the line turn around.`}
              </Verdict>
            ) : (
              <Verdict>
                {`At ${apr1}%: paid off in ${fmtMonths(a.months!)}, ${currency.format(a.totalInterest)} in interest. At ${apr2}%: ${fmtMonths(b.months!)} and ${currency.format(b.totalInterest)}. The ${Math.abs(apr1 - apr2).toFixed(1)}-point difference costs you ${currency.format(Math.abs(a.totalInterest - b.totalInterest))}.`}
                {baseA && !baseA.neverPaysOff && a.months !== null && (
                  <span className="mt-2 block text-emerald-200">
                    {`The extra ${currency.format(extra)}/month pays it off ${fmtMonths(baseA.months! - a.months)} sooner and saves ${currency.format(baseA.totalInterest - a.totalInterest)} in interest.`}
                  </span>
                )}
              </Verdict>
            )}

            {firstSplit && (
              <div className="mt-6 border-t border-slate-800 pt-5">
                <h3 className="text-sm font-semibold text-white">
                  Where each payment goes
                </h3>
                <p className="mb-3 text-xs text-slate-400">
                  {`At ${apr1}% (Rate A), paying ${currency.format(pay)}/month. Green reduces your balance; red is interest — the bank's cut.`}
                </p>
                <PaymentSplitChart
                  schedule={split.schedule}
                  crossoverMonth={split.crossoverMonth}
                  window={monthWindow}
                />
                {split.neverPaysOff ? (
                  <Verdict tone="warn">
                    {`Every dollar of your ${currency.format(pay)} payment is interest — the green slice never shows up, your balance never drops a cent, and you'd pay this forever without ever owning more of what you bought.`}
                  </Verdict>
                ) : (
                  <Verdict>
                    {`Payment one: ${currency.format(firstSplit.interest)} goes to the bank, ${currency.format(firstSplit.principal)} to your balance — ${Math.round((firstSplit.interest / pay) * 100)}¢ of every dollar is interest.`}
                    {split.crossoverMonth !== null && split.crossoverMonth > 1 && (
                      <span className="mt-2 block">
                        {`For the first ${fmtMonths(split.crossoverMonth - 1)}, the bank takes more of each payment than your balance does. As the balance falls, so does the interest it charges — from ${fmtMonths(split.crossoverMonth)} in, the majority of your money finally goes to you.`}
                      </span>
                    )}
                    {split.crossoverMonth === 1 && (
                      <span className="mt-2 block">
                        {`Most of your money goes to your balance from the very first payment — at this rate and payment, interest never gets the upper hand.`}
                      </span>
                    )}
                    <span className="mt-2 block text-slate-300">
                      {`All told: borrow ${currency.format(loanBalance)}, hand back ${currency.format(loanBalance + split.totalInterest)}. The ${apr1}% rate costs you ${currency.format(split.totalInterest)} on top of what you borrowed.`}
                    </span>
                  </Verdict>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {mode === "save" && (() => {
        const hy = savingsGrowth(start, monthly, apy1, saveYears);
        const std = savingsGrowth(start, monthly, apy2, saveYears);
        return (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Starting amount" value={start} onChange={setStart} />
              <Field label="Monthly deposit" value={monthly} onChange={setMonthly} />
              <Field label="Rate A" value={apy1} onChange={setApy1} step="0.1" suffix="% APY" />
              <Field label="Rate B" value={apy2} onChange={setApy2} step="0.1" suffix="% APY" />
            </div>
            <label className="mb-4 block text-xs text-slate-400">
              {`Over ${saveYears} year${saveYears === 1 ? "" : "s"}`}
              <input
                type="range"
                min="1"
                max="30"
                value={saveYears}
                onChange={(e) => setSaveYears(Number(e.target.value))}
                className="mt-1 w-full accent-emerald-500"
              />
            </label>
            <Curves a={hy.points} b={std.points} nameA={`At ${apy1}%`} nameB={`At ${apy2}%`} />
            <Verdict>
              {`After ${saveYears} year${saveYears === 1 ? "" : "s"}: ${currency.format(hy.ending)} at ${apy1}% vs ${currency.format(std.ending)} at ${apy2}%. Same deposits — the better rate earns you ${currency.format(hy.ending - std.ending)} extra for doing nothing different.`}
            </Verdict>
          </div>
        );
      })()}

      {mode === "versus" && (() => {
        const res = debtVsInvest(vsExtra, vsBalance, vsApr, vsReturn, vsYears);
        return (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <PrefillChips
              prefills={prefills}
              onPick={(p) => {
                setVsBalance(p.balance);
                if (p.rate) setVsApr(p.rate);
              }}
            />
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Extra each month" value={vsExtra} onChange={setVsExtra} />
              <Field label="Loan balance" value={vsBalance} onChange={setVsBalance} />
              <Field label="Loan rate" value={vsApr} onChange={setVsApr} step="0.1" suffix="% APR" />
              <Field
                label="Assumed return — not guaranteed"
                value={vsReturn}
                onChange={setVsReturn}
                step="0.1"
                suffix="%/yr"
              />
            </div>
            <label className="mb-4 block text-xs text-slate-400">
              {`Over ${vsYears} year${vsYears === 1 ? "" : "s"}`}
              <input
                type="range"
                min="1"
                max="30"
                value={vsYears}
                onChange={(e) => setVsYears(Number(e.target.value))}
                className="mt-1 w-full accent-emerald-500"
              />
            </label>
            {zoomControls}
            <Curves
              a={res.debtFirst}
              b={res.investFirst}
              nameA="Kill the debt first"
              nameB="Invest the extra"
              showZero
              window={monthWindow}
            />
            <Verdict>
              {res.winner === "debt"
                ? `Putting the extra ${currency.format(vsExtra)} toward the ${vsApr}% debt comes out ahead by ${currency.format(res.winnerMargin)} over ${vsYears} years — and that win is guaranteed, because every dollar of interest you don't pay is certain. The ${vsReturn}% return is only an assumption.`
                : res.winner === "invest"
                  ? `At these numbers, investing pulls ahead by ${currency.format(res.winnerMargin)} over ${vsYears} years — but only if the ${vsReturn}% actually shows up year after year, and nothing guarantees it will. Paying off the debt is the sure thing; investing is the bet.`
                  : `At ${vsApr}% debt vs a ${vsReturn}% assumed return, it's basically a wash — in that spot, the guaranteed option (paying the debt) is usually the calmer choice.`}
              {res.payoffMonth !== null && (
                <span className="mt-2 block text-slate-300">
                  {`Debt-first clears the loan in ${fmtMonths(res.payoffMonth)}. When debt costs more than the assumed return, killing it first is almost always the mathematical winner.`}
                </span>
              )}
            </Verdict>
          </div>
        );
      })()}

    </div>
  );
}
