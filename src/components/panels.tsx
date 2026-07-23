/**
 * The four management panels (income, buckets, expenses, what-ifs). These are
 * server components: each form posts straight to a Server Action.
 */
import { CoolingCountdown } from "@/components/CoolingCountdown";
import { InstantAction } from "@/components/InstantAction";
import { LogIncome, type ShortfallTarget } from "@/components/LogIncome";
import { coolingState } from "@/lib/coolingOff";
import {
  addBucket,
  addExpense,
  addGoal,
  addIncome,
  addWhatIf,
  decideWhatIf,
  deleteGoal,
  markGoalAchieved,
  startCoolingOff,
  deleteBucket,
  deleteExpense,
  deleteIncome,
  deleteIncomeEntry,
  deleteWhatIf,
  makeSavingsBucket,
  setBucketApy,
  setBucketGoal,
  setBucketStartingBalance,
  toggleBucketFlexible,
  toggleBucketRollsOver,
  togglePaused,
  undoRestore,
} from "@/app/actions";
import type { DashboardData } from "@/lib/rows";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Plain words for repeat schedules (8H: no "cadence" jargon on screen). */
const REPEAT_LABELS: Record<string, string> = {
  one_time: "one-time",
  monthly: "every month",
  quarterly: "every 3 months",
  yearly: "once a year",
};

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400";
const btnCls =
  "rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";
const delCls = "text-xs text-slate-500 transition hover:text-red-400";

/** Pause/resume link + toast, shared by bucket and expense rows. */
function PauseToggle({
  table,
  id,
  name,
  isPaused,
}: {
  table: "buckets" | "expenses";
  id: string;
  name: string;
  isPaused: boolean;
}) {
  return (
    <InstantAction
      action={togglePaused}
      undoAction={undoRestore}
      values={{ table, id, paused: String(!isPaused) }}
      message={
        isPaused
          ? `${name} is back on.`
          : `Paused ${name} — it sits out until you resume it.`
      }
      className="text-xs text-slate-500 transition hover:text-amber-300"
      title={
        isPaused
          ? "Resume — it rejoins your plan right away."
          : table === "buckets"
            ? "Pause — stops refilling from paychecks until you resume."
            : "Pause — this bill stops coming out until you resume."
      }
    >
      {isPaused ? "resume" : "pause"}
    </InstantAction>
  );
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900 p-5 ${className}`}>
      <h2 className="mb-3 font-semibold text-white">{title}</h2>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function IncomePanel({
  data,
  typicalPaycheck,
  shortfalls,
  funBucket,
  todayISO,
}: {
  data: DashboardData;
  typicalPaycheck: number;
  shortfalls: ShortfallTarget[];
  funBucket: { id: string; name: string } | null;
  todayISO: string;
}) {
  const recentEntries = [...data.incomeEntries].reverse().slice(0, 5);
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
            <InstantAction
              action={deleteIncome}
              undoAction={undoRestore}
              values={{ id: s.id }}
              message={`Removed ${s.name}.`}
              className={delCls}
            >
              remove
            </InstantAction>
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

      <LogIncome
        typicalPaycheck={typicalPaycheck}
        shortfalls={shortfalls}
        funBucket={funBucket}
        todayISO={todayISO}
      />

      {recentEntries.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-slate-400">
            {`Logged income (${data.incomeEntries.length})`}
          </summary>
          <ul className="mt-2 space-y-1">
            {recentEntries.map((e) => (
              <li key={e.id} className="flex items-center justify-between text-slate-400">
                <span>
                  {`${e.is_windfall ? "💰 " : ""}${currency.format(Number(e.amount))} on ${e.received_date}${e.note ? ` · ${e.note}` : ""}`}
                </span>
                <InstantAction
                  action={deleteIncomeEntry}
                  undoAction={undoRestore}
                  values={{ id: e.id }}
                  message={`Removed the ${currency.format(Number(e.amount))} entry.`}
                  className={delCls}
                >
                  ×
                </InstantAction>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------

export function GoalsPanel({ data }: { data: DashboardData }) {
  const active = data.goals.filter((g) => !g.achieved_at && !g.is_archived);
  const achieved = data.goals.filter((g) => g.achieved_at);

  return (
    <Panel title="Goals 🎯" className="lg:col-span-2">
      <ul className="mb-4 space-y-2">
        {active.map((g) => (
          <li
            key={g.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-800/60 px-3 py-2 text-sm"
          >
            <span className="text-slate-200">
              {g.name}{" "}
              <span className="text-slate-400">
                {`— ${currency.format(Number(g.target_amount))} by ${g.target_date}`}
              </span>
              {g.notes && (
                <span className="ml-2 text-xs text-slate-500">{g.notes}</span>
              )}
            </span>
            <span className="flex items-center gap-3">
              <InstantAction
                action={markGoalAchieved}
                undoAction={undoRestore}
                values={{ id: g.id }}
                message={`🎉 ${g.name} — done! That one's yours forever.`}
                className="text-xs text-slate-500 transition hover:text-emerald-300"
              >
                I did it! 🎉
              </InstantAction>
              <InstantAction
                action={deleteGoal}
                undoAction={undoRestore}
                values={{ id: g.id }}
                message={`Removed the goal ${g.name}.`}
                className={delCls}
              >
                remove
              </InstantAction>
            </span>
          </li>
        ))}
        {active.length === 0 && (
          <li className="text-sm text-slate-500">
            What are you saving toward? A cushion, a trip, a down payment —
            give it a name, a number, and a date, and the Dashboard will show
            your path to it.
          </li>
        )}
      </ul>

      <form action={addGoal} className="grid grid-cols-2 gap-2 sm:max-w-md">
        <input name="name" placeholder="Goal (e.g. House down payment)" required className={`${inputCls} col-span-2`} />
        <input name="target_amount" type="number" step="0.01" min="1" placeholder="Amount to reach" required className={inputCls} />
        <label className="text-xs text-slate-400">
          By when
          <input name="target_date" type="date" required className={`${inputCls} mt-1`} />
        </label>
        <input name="notes" placeholder="Note (optional — e.g. 20% of $200k)" className={`${inputCls} col-span-2`} />
        <button className={`${btnCls} col-span-2`}>Add goal</button>
      </form>

      {achieved.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-slate-400">
            {`Achieved (${achieved.length}) 🏆`}
          </summary>
          <ul className="mt-2 space-y-1">
            {achieved.map((g) => (
              <li key={g.id} className="flex items-center justify-between text-slate-400">
                <span>{`🏆 ${g.name} — ${currency.format(Number(g.target_amount))}`}</span>
                <InstantAction
                  action={deleteGoal}
                  undoAction={undoRestore}
                  values={{ id: g.id }}
                  message={`Removed the goal ${g.name}.`}
                  className={delCls}
                >
                  ×
                </InstantAction>
              </li>
            ))}
          </ul>
        </details>
      )}
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
            className={`flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-sm ${
              b.is_paused ? "opacity-50" : ""
            }`}
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
                  {`earns ${Number(b.apy)}%`}
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
              {b.is_paused && (
                <span className="ml-2 rounded bg-slate-500/30 px-1.5 py-0.5 text-xs text-slate-300">
                  paused ⏸
                </span>
              )}
            </span>
            <span className="flex items-center gap-3">
              {!b.is_savings && (
                <PauseToggle
                  table="buckets"
                  id={b.id}
                  name={b.name}
                  isPaused={b.is_paused}
                />
              )}
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
                  placeholder="% rate"
                  title="The interest rate (APY) your bank pays on this money"
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
              <InstantAction
                action={deleteBucket}
                undoAction={undoRestore}
                values={{ id: b.id }}
                message={`Deleted the ${b.name} bucket.`}
                className={delCls}
              >
                remove
              </InstantAction>
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
          Interest your bank pays on this money, per year (%) — like 3 for a
          high-yield savings account. Leave blank for none.
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

  // Two columns: money that leaves once vs bills that keep coming back.
  const oneTime = data.expenses.filter((e) => e.cadence === "one_time");
  const repeating = data.expenses.filter((e) => e.cadence !== "one_time");

  const row = (e: DashboardData["expenses"][number], showCadence: boolean) => (
    <li
      key={e.id}
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-800/60 px-3 py-2 text-sm ${
        e.is_paused ? "opacity-50" : ""
      }`}
    >
      <span className="text-slate-200">
        {e.name}{" "}
        <span className="text-slate-400">
          {`— ${currency.format(Number(e.amount))}${
            showCadence ? ` · ${REPEAT_LABELS[e.cadence] ?? e.cadence}` : ""
          } · from ${bucketName(e.bucket_id)} · due ${e.due_date}`}
        </span>
        {e.is_paused && (
          <span className="ml-2 rounded bg-slate-500/30 px-1.5 py-0.5 text-xs text-slate-300">
            paused ⏸
          </span>
        )}
      </span>
      <span className="flex items-center gap-3">
        <PauseToggle
          table="expenses"
          id={e.id}
          name={e.name}
          isPaused={e.is_paused}
        />
        <InstantAction
          action={deleteExpense}
          undoAction={undoRestore}
          values={{ id: e.id }}
          message={`Removed ${e.name}.`}
          className={delCls}
        >
          remove
        </InstantAction>
      </span>
    </li>
  );

  return (
    <Panel title="Upcoming bills" className="lg:col-span-2">
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            One-time payments
          </p>
          <ul className="space-y-2">
            {oneTime.map((e) => row(e, false))}
            {oneTime.length === 0 && (
              <li className="text-sm text-slate-500">
                Nothing here — one-off things like a repair or concert tickets
                land in this column.
              </li>
            )}
          </ul>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Repeating bills
          </p>
          <ul className="space-y-2">
            {repeating.map((e) => row(e, true))}
            {repeating.length === 0 && (
              <li className="text-sm text-slate-500">
                No repeating bills yet — rent, subscriptions, insurance.
              </li>
            )}
          </ul>
        </div>
      </div>

      <form action={addExpense} className="grid grid-cols-2 gap-2 sm:max-w-md">
        <input name="name" placeholder="Expense (e.g. Rent)" required className={`${inputCls} col-span-2`} />
        <input name="amount" type="number" step="0.01" min="0" placeholder="Amount" required className={inputCls} />
        <select name="cadence" className={inputCls} defaultValue="monthly">
          <option value="one_time">Just once</option>
          <option value="monthly">Every month</option>
          <option value="quarterly">Every 3 months</option>
          <option value="yearly">Once a year</option>
        </select>
        <label className="text-xs text-slate-400">
          First due date
          <input name="due_date" type="date" required className={`${inputCls} mt-1`} />
        </label>
        <label className="text-xs text-slate-400">
          Comes out of
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
    <Panel title="What if I bought…" className="lg:col-span-2">
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
                <InstantAction
                  action={decideWhatIf}
                  undoAction={undoRestore}
                  values={{ id: w.id, status: "bought" }}
                  message={`Marked "${w.name}" as bought. Enjoy it!`}
                  className="rounded bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/30"
                >
                  still want it — confirm
                </InstantAction>
              )}
              <InstantAction
                action={decideWhatIf}
                undoAction={undoRestore}
                values={{ id: w.id, status: "skipped" }}
                message={`Nice — "${w.name}" skipped. That's ${currency.format(Number(w.amount))} you kept.`}
                className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300 transition hover:bg-emerald-500/30"
              >
                said no 💪
              </InstantAction>
              <InstantAction
                action={deleteWhatIf}
                undoAction={undoRestore}
                values={{ id: w.id }}
                message={`Removed ${w.name}.`}
                className={delCls}
              >
                ×
              </InstantAction>
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
          Comes out of
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
                <InstantAction
                  action={deleteWhatIf}
                  undoAction={undoRestore}
                  values={{ id: w.id }}
                  message={`Removed ${w.name}.`}
                  className={delCls}
                >
                  ×
                </InstantAction>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}
