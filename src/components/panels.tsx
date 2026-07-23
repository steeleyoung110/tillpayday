/**
 * The four management panels (income, buckets, expenses, what-ifs). These are
 * server components: each form posts straight to a Server Action.
 */
import { CoolingCountdown } from "@/components/CoolingCountdown";
import { coolingState } from "@/lib/coolingOff";
import {
  addBucket,
  addExpense,
  addIncome,
  addWhatIf,
  decideWhatIf,
  startCoolingOff,
  deleteBucket,
  deleteExpense,
  deleteIncome,
  deleteWhatIf,
  makeSavingsBucket,
  setBucketApy,
  setBucketGoal,
  setBucketStartingBalance,
  toggleBucketFlexible,
  toggleBucketRollsOver,
} from "@/app/actions";
import type { DashboardData } from "@/lib/rows";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400";
const btnCls =
  "rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";
const delCls = "text-xs text-slate-500 transition hover:text-red-400";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="mb-3 font-semibold text-white">{title}</h2>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function IncomePanel({ data }: { data: DashboardData }) {
  return (
    <Panel title="Income sources">
      <ul className="mb-4 space-y-2">
        {data.income.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-sm"
          >
            <span className="text-slate-200">
              {s.name}{" "}
              <span className="text-slate-400">
                — {currency.format(Number(s.amount))} {s.frequency}
                {s.kind === "side" ? " (side income)" : ""}
              </span>
            </span>
            <form action={deleteIncome}>
              <input type="hidden" name="id" value={s.id} />
              <button className={delCls}>remove</button>
            </form>
          </li>
        ))}
        {data.income.length === 0 && (
          <li className="text-sm text-slate-500">No income yet — add your paycheck.</li>
        )}
      </ul>

      <form action={addIncome} className="grid grid-cols-2 gap-2">
        <input name="name" placeholder="Name (e.g. Day job)" required className={`${inputCls} col-span-2`} />
        <input name="amount" type="number" step="0.01" min="0" placeholder="Amount per check" required className={inputCls} />
        <select name="frequency" required className={inputCls} defaultValue="biweekly">
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every 2 weeks</option>
          <option value="semimonthly">Twice a month</option>
          <option value="monthly">Monthly</option>
        </select>
        <label className="col-span-2 text-xs text-slate-400">
          Next (or any recent) pay date
          <input name="anchor_date" type="date" required className={`${inputCls} mt-1`} />
        </label>
        <select name="kind" className={inputCls} defaultValue="paycheck">
          <option value="paycheck">Paycheck (split into buckets)</option>
          <option value="side">Side income (straight to savings)</option>
        </select>
        <button className={btnCls}>Add income</button>
      </form>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

export function BucketsPanel({ data }: { data: DashboardData }) {
  return (
    <Panel title="Buckets (how each paycheck splits)">
      <ul className="mb-4 space-y-2">
        {data.buckets.map((b) => (
          <li
            key={b.id}
            className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-sm"
          >
            <span className="text-slate-200">
              {b.name}{" "}
              <span className="text-slate-400">
                —{" "}
                {b.allocation_type === "fixed"
                  ? `${currency.format(Number(b.allocation_value))}/check`
                  : `${Number(b.allocation_value)}% of check`}
              </span>
              {b.is_savings && (
                <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-xs text-emerald-300">
                  savings ★ gets leftovers
                </span>
              )}
              {Number(b.apy) > 0 && (
                <span className="ml-2 rounded bg-sky-500/20 px-1.5 py-0.5 text-xs text-sky-300">
                  {Number(b.apy)}% APY
                </span>
              )}
              {b.is_flexible && (
                <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-300">
                  flexible 💸
                </span>
              )}
              {b.rolls_over && (
                <span className="ml-2 rounded bg-violet-500/20 px-1.5 py-0.5 text-xs text-violet-300">
                  rolls over 🎯
                </span>
              )}
            </span>
            <span className="flex items-center gap-3">
              {b.is_savings && (
                <form action={setBucketGoal} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={b.id} />
                  <input
                    name="goal_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={Number(b.goal_amount) > 0 ? Number(b.goal_amount) : undefined}
                    placeholder="Goal $"
                    className="w-20 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs text-white outline-none focus:border-emerald-400"
                  />
                  <button className="text-xs text-slate-500 transition hover:text-emerald-300">
                    set
                  </button>
                </form>
              )}
              {b.is_savings && (
                <form action={setBucketStartingBalance} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={b.id} />
                  <input
                    name="starting_balance"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={Number(b.starting_balance) > 0 ? Number(b.starting_balance) : undefined}
                    placeholder="Start $"
                    className="w-20 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs text-white outline-none focus:border-emerald-400"
                  />
                  <button className="text-xs text-slate-500 transition hover:text-emerald-300">
                    set
                  </button>
                </form>
              )}
              <form action={setBucketApy} className="flex items-center gap-1">
                <input type="hidden" name="id" value={b.id} />
                <input
                  name="apy"
                  type="number"
                  step="0.001"
                  min="0"
                  defaultValue={Number(b.apy) > 0 ? Number(b.apy) : undefined}
                  placeholder="APY %"
                  className="w-16 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs text-white outline-none focus:border-emerald-400"
                />
                <button className="text-xs text-slate-500 transition hover:text-emerald-300">
                  set
                </button>
              </form>
              {!b.is_savings && (
                <form
                  action={toggleBucketRollsOver}
                  title="Sinking funds keep their balance between paychecks and stack up their allocation every check."
                >
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="rolls_over" value={b.rolls_over ? "false" : "true"} />
                  <button className="text-xs text-slate-500 transition hover:text-violet-300">
                    {b.rolls_over ? "sweep each check" : "make it roll over"}
                  </button>
                </form>
              )}
              {!b.is_savings && (
                <form action={toggleBucketFlexible}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="flexible" value={b.is_flexible ? "false" : "true"} />
                  <button className="text-xs text-slate-500 transition hover:text-amber-300">
                    {b.is_flexible ? "not flexible" : "make flexible"}
                  </button>
                </form>
              )}
              {!b.is_savings && (
                <form action={makeSavingsBucket}>
                  <input type="hidden" name="id" value={b.id} />
                  <button className="text-xs text-slate-500 transition hover:text-emerald-300">
                    make savings
                  </button>
                </form>
              )}
              <form action={deleteBucket}>
                <input type="hidden" name="id" value={b.id} />
                <button className={delCls}>remove</button>
              </form>
            </span>
          </li>
        ))}
        {data.buckets.length === 0 && (
          <li className="text-sm text-slate-500">
            No buckets yet — try Rent, Groceries, Fun money, and a Savings bucket.
          </li>
        )}
      </ul>

      <form action={addBucket} className="grid grid-cols-2 gap-2">
        <input name="name" placeholder="Bucket name (e.g. Rent)" required className={`${inputCls} col-span-2`} />
        <select name="allocation_type" className={inputCls} defaultValue="fixed">
          <option value="fixed">Fixed $ per check</option>
          <option value="percent">% of each check</option>
        </select>
        <input name="allocation_value" type="number" step="0.01" min="0" placeholder="Amount or %" required className={inputCls} />
        <label className="col-span-2 text-xs text-slate-400">
          APY % of the account behind it — e.g. 3 for a high-yield savings
          account, 0.02 for a big bank (leave blank for none)
          <input name="apy" type="number" step="0.001" min="0" placeholder="0" className={`${inputCls} mt-1`} />
        </label>
        <label className="col-span-2 flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" name="is_flexible" className="accent-amber-500" />
          Flexible spending money (counts toward the safe-to-spend number)
        </label>
        <label className="col-span-2 flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" name="rolls_over" className="accent-violet-500" />
          Sinking fund — keeps its balance and stacks up every paycheck (e.g. a
          concert or vacation fund)
        </label>
        <label className="col-span-2 flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" name="is_savings" className="accent-emerald-500" />
          This is my savings bucket (receives all leftover money)
        </label>
        <button className={`${btnCls} col-span-2`}>Add bucket</button>
      </form>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

export function ExpensesPanel({ data }: { data: DashboardData }) {
  const bucketName = (id: string | null) =>
    data.buckets.find((b) => b.id === id)?.name ?? "Savings/leftover";

  return (
    <Panel title="Planned expenses">
      <ul className="mb-4 space-y-2">
        {data.expenses.map((e) => (
          <li
            key={e.id}
            className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-sm"
          >
            <span className="text-slate-200">
              {e.name}{" "}
              <span className="text-slate-400">
                {`— ${currency.format(Number(e.amount))} · ${e.cadence.replace("_", "-")} · from ${bucketName(e.bucket_id)} · due ${e.due_date}`}
              </span>
            </span>
            <form action={deleteExpense}>
              <input type="hidden" name="id" value={e.id} />
              <button className={delCls}>remove</button>
            </form>
          </li>
        ))}
        {data.expenses.length === 0 && (
          <li className="text-sm text-slate-500">No expenses yet.</li>
        )}
      </ul>

      <form action={addExpense} className="grid grid-cols-2 gap-2">
        <input name="name" placeholder="Expense (e.g. Rent)" required className={`${inputCls} col-span-2`} />
        <input name="amount" type="number" step="0.01" min="0" placeholder="Amount" required className={inputCls} />
        <select name="cadence" className={inputCls} defaultValue="monthly">
          <option value="one_time">One-time</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="yearly">Yearly</option>
        </select>
        <label className="text-xs text-slate-400">
          First due date
          <input name="due_date" type="date" required className={`${inputCls} mt-1`} />
        </label>
        <label className="text-xs text-slate-400">
          Paid from bucket
          <select name="bucket_id" className={`${inputCls} mt-1`} defaultValue="">
            <option value="">Savings / leftover</option>
            {data.buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button className={`${btnCls} col-span-2`}>Add expense</button>
      </form>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

export function WhatIfPanel({ data }: { data: DashboardData }) {
  const considering = data.whatIf.filter((w) => w.status === "considering");
  const decided = data.whatIf.filter((w) => w.status !== "considering");
  const now = Date.now();

  return (
    <Panel title="What if I bought…">
      <ul className="mb-4 space-y-2">
        {considering.map((w) => {
          const cooling = coolingState(w.cooling_off_started_at, now);
          return (
          <li
            key={w.id}
            className="flex items-center justify-between gap-2 rounded-lg bg-slate-800/60 px-3 py-2 text-sm"
          >
            <span className="text-slate-200">
              {w.name}{" "}
              <span className="text-slate-400">
                {`— ${currency.format(Number(w.amount))} · around ${w.target_date}`}
              </span>
            </span>
            <span className="flex flex-wrap items-center justify-end gap-2">
              {cooling.phase === "none" && (
                <form
                  action={startCoolingOff}
                  title="Starts a 48-hour cooling-off timer — you confirm after it ends."
                >
                  <input type="hidden" name="id" value={w.id} />
                  <button className="rounded bg-sky-500/20 px-2 py-0.5 text-xs text-sky-300 transition hover:bg-sky-500/30">
                    I want to buy it
                  </button>
                </form>
              )}
              {cooling.phase === "cooling" && (
                <CoolingCountdown endsAtMs={cooling.endsAtMs} />
              )}
              {cooling.phase === "ready" && (
                <form action={decideWhatIf}>
                  <input type="hidden" name="id" value={w.id} />
                  <input type="hidden" name="status" value="bought" />
                  <button className="rounded bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/30">
                    still want it — confirm
                  </button>
                </form>
              )}
              <form action={decideWhatIf}>
                <input type="hidden" name="id" value={w.id} />
                <input type="hidden" name="status" value="skipped" />
                <button className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300 transition hover:bg-emerald-500/30">
                  said no 💪
                </button>
              </form>
              <form action={deleteWhatIf}>
                <input type="hidden" name="id" value={w.id} />
                <button className={delCls}>×</button>
              </form>
            </span>
          </li>
          );
        })}
        {considering.length === 0 && (
          <li className="text-sm text-slate-500">
            Nothing under consideration. Add a purchase to see its impact on the chart.
          </li>
        )}
      </ul>

      <form action={addWhatIf} className="mb-4 grid grid-cols-2 gap-2">
        <input name="name" placeholder="Thing (e.g. New phone)" required className={`${inputCls} col-span-2`} />
        <input name="amount" type="number" step="0.01" min="0" placeholder="Cost" required className={inputCls} />
        <label className="text-xs text-slate-400">
          When you&apos;d buy it
          <input name="target_date" type="date" required className={`${inputCls} mt-1`} />
        </label>
        <label className="col-span-2 text-xs text-slate-400">
          Paid from bucket
          <select name="bucket_id" className={`${inputCls} mt-1`} defaultValue="">
            <option value="">Savings / leftover</option>
            {data.buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button className={`${btnCls} col-span-2`}>Add to what-ifs</button>
      </form>

      {decided.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-400">
            Decision history ({decided.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {decided.map((w) => (
              <li key={w.id} className="flex items-center justify-between text-slate-400">
                <span>
                  {`${w.status === "skipped" ? "🙅 Skipped" : "🛍️ Bought"}: ${w.name} (${currency.format(Number(w.amount))})`}
                </span>
                <form action={deleteWhatIf}>
                  <input type="hidden" name="id" value={w.id} />
                  <button className={delCls}>×</button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}
