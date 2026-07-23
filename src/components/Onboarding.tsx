"use client";

/**
 * Three-question first-time setup, one question per screen:
 *   1. How much is your paycheck? ("it varies" flips to irregular mode)
 *   2. When's your next payday? (irregular: log recent income instead)
 *   3. Pick a starting style (the three bucket templates)
 * Everything submits in one server action; the user lands on a live dashboard.
 */
import { useState } from "react";
import { completeOnboarding } from "@/app/actions";
import { STARTER_TEMPLATES } from "@/lib/templates";

type Mode = "regular" | "irregular";

interface EntryDraft {
  amount: string;
  date: string;
}

const FREQUENCIES = [
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "semimonthly", label: "Twice a month" },
  { value: "monthly", label: "Once a month" },
] as const;

const inputCls =
  "w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-lg text-white outline-none focus:border-emerald-400";

export function Onboarding({
  hasIncome,
  todayISO,
}: {
  /** Account already has income (e.g. rebuilt buckets) — skip to step 3. */
  hasIncome: boolean;
  todayISO: string;
}) {
  const [step, setStep] = useState(hasIncome ? 3 : 1);
  const [mode, setMode] = useState<Mode>("regular");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("biweekly");
  const [nextPayday, setNextPayday] = useState("");
  const [entries, setEntries] = useState<EntryDraft[]>([
    { amount: "", date: todayISO },
  ]);

  const payload = JSON.stringify({
    mode: hasIncome ? "skip" : mode,
    amount: Number(amount) || 0,
    frequency,
    nextPayday,
    entries: entries
      .filter((e) => Number(e.amount) > 0 && e.date)
      .map((e) => ({ amount: Number(e.amount), date: e.date })),
  });

  const dots = (
    <div className="mb-8 flex justify-center gap-2">
      {[1, 2, 3].map((s) => (
        <span
          key={s}
          className={`h-2.5 w-2.5 rounded-full ${
            s <= step ? "bg-emerald-400" : "bg-slate-700"
          }`}
        />
      ))}
    </div>
  );

  const backBtn = (to: number) => (
    <button
      type="button"
      onClick={() => setStep(to)}
      className="mt-6 text-sm text-slate-500 transition hover:text-slate-300"
    >
      ← Back
    </button>
  );

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        {dots}

        {step === 1 && (
          <div>
            <h1 className="text-3xl font-black text-white">
              How much is your paycheck?
            </h1>
            <p className="mt-2 text-slate-400">
              Whatever usually lands in your account. A close guess is fine —
              you can change it anytime.
            </p>
            <div className="mt-6">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="$ 0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${inputCls} text-center text-3xl font-bold`}
                autoFocus
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {FREQUENCIES.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFrequency(f.value)}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                    frequency === f.value
                      ? "border-emerald-400 bg-emerald-500/15 text-emerald-300"
                      : "border-slate-700 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!(Number(amount) > 0)}
              onClick={() => {
                setMode("regular");
                setStep(2);
              }}
              className="mt-6 w-full rounded-xl bg-emerald-500 px-4 py-3 text-lg font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("irregular");
                setStep(2);
              }}
              className="mt-4 text-sm text-sky-300 transition hover:text-sky-200"
            >
              It varies from paycheck to paycheck →
            </button>
          </div>
        )}

        {step === 2 && mode === "regular" && (
          <div>
            <h1 className="text-3xl font-black text-white">
              When&apos;s your next payday?
            </h1>
            <p className="mt-2 text-slate-400">
              Your best guess works — any recent payday does too.
            </p>
            <input
              type="date"
              value={nextPayday}
              onChange={(e) => setNextPayday(e.target.value)}
              className={`${inputCls} mt-6 text-center`}
              autoFocus
            />
            <button
              type="button"
              disabled={!nextPayday}
              onClick={() => setStep(3)}
              className="mt-6 w-full rounded-xl bg-emerald-500 px-4 py-3 text-lg font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
            {backBtn(1)}
          </div>
        )}

        {step === 2 && mode === "irregular" && (
          <div>
            <h1 className="text-3xl font-black text-white">
              What have you made lately?
            </h1>
            <p className="mt-2 text-slate-400">
              Log a few recent paydays. We&apos;ll plan around a careful average
              — and you can keep logging as money comes in.
            </p>
            <div className="mt-6 space-y-2">
              {entries.map((e, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="$ amount"
                    value={e.amount}
                    onChange={(ev) =>
                      setEntries(
                        entries.map((x, j) =>
                          j === i ? { ...x, amount: ev.target.value } : x,
                        ),
                      )
                    }
                    className={inputCls}
                  />
                  <input
                    type="date"
                    value={e.date}
                    max={todayISO}
                    onChange={(ev) =>
                      setEntries(
                        entries.map((x, j) =>
                          j === i ? { ...x, date: ev.target.value } : x,
                        ),
                      )
                    }
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
            {entries.length < 6 && (
              <button
                type="button"
                onClick={() =>
                  setEntries([...entries, { amount: "", date: todayISO }])
                }
                className="mt-3 text-sm text-sky-300 transition hover:text-sky-200"
              >
                + add another
              </button>
            )}
            <button
              type="button"
              onClick={() => setStep(3)}
              className="mt-6 w-full rounded-xl bg-emerald-500 px-4 py-3 text-lg font-bold text-slate-950 transition hover:bg-emerald-400"
            >
              Next
            </button>
            <p className="mt-3 text-xs text-slate-500">
              Nothing to log yet? That&apos;s fine — just hit Next.
            </p>
            {backBtn(1)}
          </div>
        )}

        {step === 3 && (
          <div>
            <h1 className="text-3xl font-black text-white">
              Pick a starting style
            </h1>
            <p className="mt-2 text-slate-400">
              Three ready-made ways to split each paycheck. Rename, re-balance,
              or delete anything later.
            </p>
            <div className="mt-6 space-y-3">
              {STARTER_TEMPLATES.map((t) => (
                <form key={t.key} action={completeOnboarding}>
                  <input
                    type="hidden"
                    name="payload"
                    value={JSON.stringify({ ...JSON.parse(payload), template: t.key })}
                  />
                  <button className="w-full rounded-2xl border border-slate-700 bg-slate-800/50 p-5 text-left transition hover:border-emerald-400/60">
                    <span className="block text-lg font-bold text-white">
                      {t.title}
                    </span>
                    <span className="block text-xs text-slate-400">{t.tagline}</span>
                    <span className="mt-2 block text-sm text-slate-300">
                      {t.breakdown.join(" · ")}
                    </span>
                  </button>
                </form>
              ))}
            </div>
            {!hasIncome && backBtn(2)}
          </div>
        )}
      </div>
    </div>
  );
}
