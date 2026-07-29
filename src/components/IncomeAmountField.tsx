"use client";

/**
 * The amount + frequency cells of the add-income form, with a second way in
 * for salaried folks: type the annual salary and we do the ÷ 26 (or 52/24/12)
 * for them. The computed per-check number lands in the same `amount` field
 * the form already posts — the server action doesn't know the difference.
 *
 * Honest-numbers rule: salary ÷ checks is the before-tax number. At 100%
 * take-home we say so loudly instead of letting an inflated paycheck quietly
 * wreck every projection downstream.
 */
import { useState } from "react";
import { CHECKS_PER_YEAR, salaryPerCheck, type PayFrequency } from "@/lib/salary";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400";

const FREQUENCY_OPTIONS: { value: PayFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "semimonthly", label: "Twice a month" },
  { value: "monthly", label: "Monthly" },
];

export function IncomeAmountField() {
  const [mode, setMode] = useState<"check" | "salary">("check");
  const [frequency, setFrequency] = useState<PayFrequency>("biweekly");
  const [salary, setSalary] = useState("");
  const [pct, setPct] = useState("100");

  const perCheck = salaryPerCheck(Number(salary), frequency, Number(pct));
  const checksPerYear = CHECKS_PER_YEAR[frequency];
  const grossMode = Number(pct) >= 100;

  const frequencySelect = (
    <select
      name="frequency"
      required
      className={inputCls}
      value={frequency}
      onChange={(e) => setFrequency(e.target.value as PayFrequency)}
    >
      {FREQUENCY_OPTIONS.map((f) => (
        <option key={f.value} value={f.value}>
          {f.label}
        </option>
      ))}
    </select>
  );

  if (mode === "check") {
    return (
      <>
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0"
          placeholder="Amount per check"
          required
          className={inputCls}
        />
        {frequencySelect}
        <button
          type="button"
          onClick={() => setMode("salary")}
          className="col-span-2 text-left text-xs text-sky-300 transition hover:text-sky-200"
        >
          Know your yearly salary, not your paycheck? →
        </button>
      </>
    );
  }

  return (
    <>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        placeholder="Annual salary (e.g. 65000)"
        value={salary}
        onChange={(e) => setSalary(e.target.value)}
        className={inputCls}
        autoFocus
      />
      {frequencySelect}
      <label className="col-span-2 text-xs text-slate-400">
        % of pay that actually hits your bank (after taxes, 401k, insurance)
        <input
          type="number"
          inputMode="numeric"
          min="1"
          max="100"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          className={`${inputCls} mt-1`}
        />
      </label>
      {/* The value the form actually posts — visible (and required, so an
          empty salary can't sneak a $0 income in) but not hand-editable. */}
      <label className="col-span-2 text-xs text-slate-400">
        {`Per check, that's (${checksPerYear} checks a year)`}
        <input
          name="amount"
          type="number"
          readOnly
          required
          value={perCheck > 0 ? perCheck : ""}
          className={`${inputCls} mt-1 font-semibold text-emerald-300`}
        />
      </label>
      {perCheck > 0 && grossMode && (
        <p className="col-span-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {`${currency.format(perCheck)} is the before-tax number — most take-home pay runs 20–30% lower. Check a real deposit and set the % above, or your whole plan starts too rich.`}
        </p>
      )}
      <button
        type="button"
        onClick={() => setMode("check")}
        className="col-span-2 text-left text-xs text-sky-300 transition hover:text-sky-200"
      >
        ← Back to per-paycheck amount
      </button>
    </>
  );
}
