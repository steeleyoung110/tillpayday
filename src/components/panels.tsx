/**
 * The four management panels (income, buckets, expenses, what-ifs). These are
 * server components: each form posts straight to a Server Action.
 */
import { AddExpenseForm, type BucketOption } from "@/components/AddExpenseForm";
import { CoolingCountdown } from "@/components/CoolingCountdown";
import { ExpenseBucketSelect } from "@/components/ExpenseBucketSelect";
import { IncomeAmountField } from "@/components/IncomeAmountField";
import { InstantAction } from "@/components/InstantAction";
import { LogIncome, type ShortfallTarget } from "@/components/LogIncome";
import { coolingState } from "@/lib/coolingOff";
import {
  addBucket,
  addGoal,
  addIncome,
  addTransfer,
  addWhatIf,
  decideWhatIf,
  deleteGoal,
  markGoalAchieved,
  startCoolingOff,
  updateExpenseAmount,
  deleteBucket,
  deleteExpense,
  deleteIncome,
  deleteIncomeEntry,
  deleteTransfer,
  deleteWhatIf,
  makeSavingsBucket,
  setAutopay,
  setBucketApy,
  setRenewalDate,
  setSplitWays,
  setBucketGoal,
  setBucketStartingBalance,
  toggleBucketFlexible,
  toggleBucketRollsOver,
  togglePaused,
  undoRestore,
} from "@/app/actions";
import { expenseShare, type DashboardData } from "@/lib/rows";

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
  id,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  /** Anchor for the Budget page's jump links. */
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`scroll-mt-20 rounded-2xl border border-slate-800 bg-slate-900 p-5 ${className}`}
    >
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
    <Panel title="Income sources" id="income">
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
        <IncomeAmountField />
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
    <Panel title="Goals 🎯" className="lg:col-span-2" id="goals">
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

export function BucketsPanel({
  data,
  balances,
  perCheck,
  colors,
  pace,
}: {
  data: DashboardData;
  /** Today's balance per bucket id ("" = savings/leftover). Optional. */
  balances?: Record<string, number>;
  /** Dollars each bucket gets from a typical check (for the envelope bar). */
  perCheck?: Record<string, number>;
  /** Semantic color per bucket id — matches the pies and charts. */
  colors?: Record<string, string>;
  /** Cycle pace per bucket id: % of plan spent vs % of cycle elapsed. */
  pace?: Record<string, { spentPct: number; elapsedPct: number; status: string }>;
}) {
  return (
    <Panel title="Buckets (how each paycheck splits)" id="buckets">
      <ul className="mb-4 space-y-2">
        {data.buckets.map((b) => {
          const bal = b.is_savings ? balances?.[""] : balances?.[b.id];
          const refill = perCheck?.[b.id] ?? 0;
          const inTheHole = bal !== undefined && bal < 0;
          // Envelope bar: how full this bucket is against one check's refill.
          // Only savings can be negative (the cascade rule) — that reads red.
          const fillPct =
            bal === undefined
              ? null
              : inTheHole
                ? 100
                : refill > 0
                  ? Math.min(100, Math.round((bal / refill) * 100))
                  : bal > 0
                    ? 100
                    : 0;
          return (
          <li
            key={b.id}
            className={`rounded-lg bg-slate-800/60 px-3 py-2 text-sm ${
              b.is_paused ? "opacity-50" : ""
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
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
                {pace?.[b.id] && pace[b.id].status === "spent" && (
                  <span className="ml-2 rounded bg-red-500/20 px-1.5 py-0.5 text-xs font-semibold text-red-300">
                    plan fully spent
                  </span>
                )}
                {pace?.[b.id] && pace[b.id].status === "hot" && (
                  <span className="ml-2 rounded bg-red-500/20 px-1.5 py-0.5 text-xs text-red-300">
                    {`🔥 running hot — ${pace[b.id].spentPct}% spent, ${pace[b.id].elapsedPct}% of cycle gone`}
                  </span>
                )}
                {pace?.[b.id] && pace[b.id].status === "cool" && (
                  <span className="ml-2 rounded bg-sky-500/15 px-1.5 py-0.5 text-xs text-sky-300">
                    pacing easy
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3">
                {bal !== undefined && (
                  <span
                    className={`text-xs font-semibold ${
                      inTheHole ? "text-red-400" : "text-slate-300"
                    }`}
                  >
                    {inTheHole
                      ? `${currency.format(bal)} — in the hole`
                      : `holding ${currency.format(bal)}`}
                  </span>
                )}
                {!b.is_savings && (
                  <PauseToggle
                    table="buckets"
                    id={b.id}
                    name={b.name}
                    isPaused={b.is_paused}
                  />
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
            </div>

            {fillPct !== null && (
              <div
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/50"
                title={
                  inTheHole
                    ? "Below zero — spending drained this and kept going."
                    : refill > 0
                      ? `${fillPct}% of one check's refill (${currency.format(refill)}) still standing`
                      : "What's sitting in it right now"
                }
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${fillPct}%`,
                    backgroundColor: inTheHole
                      ? "#ef4444"
                      : colors?.[b.id] ?? "#22c55e",
                  }}
                />
              </div>
            )}

            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-slate-500 transition hover:text-slate-300">
                settings
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-3">
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
              </div>
            </details>
          </li>
          );
        })}
        {data.buckets.length === 0 && (
          <li className="text-sm text-slate-500">
            No buckets yet — try Rent, Groceries, Fun money, and a Savings bucket.
          </li>
        )}
      </ul>

      {data.buckets.length > 1 && (
        <div className="mb-4 rounded-xl border border-slate-700/60 bg-slate-800/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Move money between buckets
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Robbing Peter to pay Paul — on purpose, with your eyes open. Taking
            from a spending bucket stops at $0; only savings can go red.
          </p>
          <form action={addTransfer} className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-400">
              From
              <select name="from_bucket_id" className={`${inputCls} mt-1 w-36`} defaultValue="">
                <option value="">Savings / leftover</option>
                {data.buckets
                  .filter((b) => !b.is_savings)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              To
              <select
                name="to_bucket_id"
                className={`${inputCls} mt-1 w-36`}
                defaultValue={data.buckets.find((b) => !b.is_savings)?.id ?? ""}
              >
                <option value="">Savings / leftover</option>
                {data.buckets
                  .filter((b) => !b.is_savings)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </label>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="$"
              required
              className={`${inputCls} w-24`}
            />
            <button className={btnCls}>Move it</button>
          </form>
          {data.transfers.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs">
              {[...data.transfers]
                .reverse()
                .slice(0, 4)
                .map((t) => {
                  const nameOf = (id: string | null) =>
                    id === null
                      ? "Savings / leftover"
                      : data.buckets.find((b) => b.id === id)?.name ?? "a bucket";
                  return (
                    <li key={t.id} className="flex items-center justify-between text-slate-400">
                      <span>
                        {`${currency.format(Number(t.amount))}: ${nameOf(t.from_bucket_id)} → ${nameOf(t.to_bucket_id)} on ${t.transfer_date}`}
                      </span>
                      <InstantAction
                        action={deleteTransfer}
                        undoAction={undoRestore}
                        values={{ id: t.id }}
                        message={`Put that ${currency.format(Number(t.amount))} back.`}
                        className={delCls}
                      >
                        undo move
                      </InstantAction>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      )}

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

export function ExpensesPanel({
  data,
  balances,
  todayISO,
  sharedPrefill,
  searchQuery = "",
  hourlyWage = null,
}: {
  data: DashboardData;
  /** Current balance per bucket id ("" = savings/leftover), for the
   * overdraft decision popup. Optional — without it, no gate. */
  balances?: Record<string, number>;
  todayISO: string;
  /** Quick-spend prefill from a Web Share Target share. */
  sharedPrefill?: { name: string; amount: string };
  /** Server-side name filter (?q=) — find "McDonald's" in a long list. */
  searchQuery?: string;
  /** Hourly wage (work-hours lens): bills get a second price tag in hours. */
  hourlyWage?: number | null;
}) {
  // Two columns: money that leaves once vs bills that keep coming back.
  const q = searchQuery.trim().toLowerCase();
  const matches = (e: DashboardData["expenses"][number]) =>
    q === "" || e.name.toLowerCase().includes(q);
  const oneTime = data.expenses.filter((e) => e.cadence === "one_time" && matches(e));
  const repeating = data.expenses.filter((e) => e.cadence !== "one_time" && matches(e));
  const hiddenCount =
    data.expenses.length - oneTime.length - repeating.length;

  const bucketChoices = data.buckets.map((b) => ({ id: b.id, name: b.name }));
  const options: BucketOption[] = [
    { id: "", name: "Savings / leftover", balance: balances?.[""] },
    ...data.buckets.map((b) => ({
      id: b.id,
      name: b.name,
      balance: balances?.[b.id],
    })),
  ];

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
          } · due ${e.due_date}`}
        </span>
        {hourlyWage && hourlyWage > 0 && (
          <span className="ml-2 text-xs text-amber-300/80">
            {`⏱ ${(Number(e.amount) / hourlyWage).toFixed(1)}h of work`}
          </span>
        )}
        {e.is_paused && (
          <span className="ml-2 rounded bg-slate-500/30 px-1.5 py-0.5 text-xs text-slate-300">
            paused ⏸
          </span>
        )}
        {e.renewal_date && (
          <span
            className="ml-2 rounded bg-sky-500/20 px-1.5 py-0.5 text-xs text-sky-300"
            title="Contract watch: you'll get a heads-up 30 days before this renews."
          >
            {`renews ${e.renewal_date} 🔔`}
          </span>
        )}
        {Number(e.split_ways) > 1 && (
          <span
            className="ml-2 rounded bg-violet-500/20 px-1.5 py-0.5 text-xs text-violet-300"
            title="Roommate mode: only YOUR share hits your buckets and projections."
          >
            {`split ×${e.split_ways} — yours ${currency.format(expenseShare(e))}`}
          </span>
        )}
      </span>
      <span className="flex items-center gap-3">
        <form
          action={setSplitWays}
          className="flex items-center gap-1"
          title="Roommate mode: split this bill N ways — your projections only carry your share. (You still front the full amount; collecting is on you.)"
        >
          <input type="hidden" name="id" value={e.id} />
          <select
            name="split_ways"
            defaultValue={String(e.split_ways ?? 1)}
            className="rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-xs text-white outline-none focus:border-violet-400"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "not split" : `÷ ${n}`}
              </option>
            ))}
          </select>
          <button className="text-xs text-slate-500 transition hover:text-violet-300">
            split
          </button>
        </form>
        {showCadence && (
          <form
            action={setAutopay}
            className="flex items-center gap-1"
            title="Autopay audit: manual bills get a pay-it reminder on the day; autopay bills get a did-it-actually-charge check the day after."
          >
            <input type="hidden" name="id" value={e.id} />
            <select
              name="autopay"
              defaultValue={e.autopay === null || e.autopay === undefined ? "" : String(e.autopay)}
              className="rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-xs text-white outline-none focus:border-emerald-400"
            >
              <option value="">pay: ?</option>
              <option value="true">autopay 🤖</option>
              <option value="false">manual ✍️</option>
            </select>
            <button className="text-xs text-slate-500 transition hover:text-emerald-300">
              set
            </button>
          </form>
        )}
        {showCadence && (
          <form
            action={setRenewalDate}
            className="flex items-center gap-1"
            title="Contract watch: set the date this contract renews (insurance, phone, annual plans) and you'll get a shop-it-around nudge 30 days out. Clear the date to stop watching."
          >
            <input type="hidden" name="id" value={e.id} />
            <input
              name="renewal_date"
              type="date"
              defaultValue={e.renewal_date ?? ""}
              className="w-32 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs text-white outline-none focus:border-emerald-400"
            />
            <button className="text-xs text-slate-500 transition hover:text-sky-300">
              renews
            </button>
          </form>
        )}
        <form action={updateExpenseAmount} className="flex items-center gap-1">
          <input type="hidden" name="id" value={e.id} />
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="new $"
            title="Change this bill's amount — the old price is remembered, so price creep stays visible."
            className="w-16 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs text-white outline-none focus:border-emerald-400"
          />
          <button className="text-xs text-slate-500 transition hover:text-emerald-300">
            set
          </button>
        </form>
        <ExpenseBucketSelect
          expenseId={e.id}
          expenseName={e.name}
          current={e.bucket_id}
          buckets={bucketChoices}
        />
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

  const funBucket = data.buckets.find((b) => b.is_flexible && !b.is_savings);

  return (
    <Panel title="Upcoming bills" className="lg:col-span-2" id="bills">
      <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300/80">
          {sharedPrefill
            ? "Shared into Till Payday — check it and log it"
            : "Log a spend — the five-second version"}
        </p>
        <AddExpenseForm
          key={sharedPrefill ? `${sharedPrefill.name}-${sharedPrefill.amount}` : "quick"}
          options={options}
          todayISO={todayISO}
          variant="quick"
          defaultBucketId={funBucket?.id ?? ""}
          initialName={sharedPrefill?.name ?? ""}
          initialAmount={sharedPrefill?.amount ?? ""}
        />
      </div>
      <form action="/budget" method="get" className="mb-3 flex items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={searchQuery}
          placeholder="Search your bills and spends…"
          className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-400"
        />
        <button className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-emerald-400 hover:text-white">
          Find
        </button>
        {q !== "" && (
          <a href="/budget#bills" className="text-xs text-sky-300 transition hover:text-sky-200">
            {`clear (${hiddenCount} hidden)`}
          </a>
        )}
      </form>

      {(() => {
        const owed = data.expenses
          .filter((e) => Number(e.split_ways) > 1 && !e.is_paused)
          .reduce((s, e) => s + (Number(e.amount) - expenseShare(e)), 0);
        return owed > 0 ? (
          <p className="mb-3 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">
            {`🤝 Roommate ledger: ${currency.format(Math.round(owed * 100) / 100)} of the bills listed is other people's share. You front it; they owe it. Chase it — "I'll get you back" is not a payment method.`}
          </p>
        ) : null;
      })()}

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

      <details>
        <summary className="cursor-pointer text-xs text-slate-500 transition hover:text-slate-300">
          Add a bill instead (repeating, future-dated, or a big one-off)
        </summary>
        <div className="mt-3">
          <AddExpenseForm options={options} todayISO={todayISO} />
        </div>
      </details>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

export function WhatIfPanel({ data }: { data: DashboardData }) {
  const considering = data.whatIf.filter((w) => w.status === "considering");
  const decided = data.whatIf.filter((w) => w.status !== "considering");
  const now = Date.now();

  return (
    <Panel title="What if I bought…" className="lg:col-span-2" id="what-ifs">
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
