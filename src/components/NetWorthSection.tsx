/**
 * The net-worth section: assets minus liabilities, entered by the user. This is
 * the "where am I starting from?" step — the liquid part (cash + savings) also
 * seeds the projection's starting savings balance, so the chart begins from
 * what you actually have instead of zero.
 */
import { addNetWorthItem, deleteNetWorthItem, undoRestore } from "@/app/actions";
import { InstantAction } from "@/components/InstantAction";
import {
  LIQUID_CATEGORIES,
  type DashboardData,
  type NetWorthCategory,
  type NetWorthRow,
} from "@/lib/rows";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const CATEGORY_LABELS: Record<NetWorthCategory, string> = {
  cash: "Cash / checking",
  savings: "Savings account",
  investment: "Investments",
  property: "Home / property",
  vehicle: "Vehicle",
  other_asset: "Other asset",
  credit_card: "Credit card",
  student_loan: "Student loan",
  auto_loan: "Auto loan",
  mortgage: "Mortgage",
  other_debt: "Other debt",
};

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400";
const btnCls =
  "rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";
const delCls = "text-xs text-slate-500 transition hover:text-red-400";

function ItemList({ items }: { items: NetWorthRow[] }) {
  return (
    <ul className="mb-4 space-y-2">
      {items.map((i) => (
        <li
          key={i.id}
          className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-sm"
        >
          <span className="text-slate-200">
            {i.name}{" "}
            <span className="text-slate-400">
              {`— ${currency.format(Number(i.amount))} · ${CATEGORY_LABELS[i.category]}`}
              {Number(i.apy) > 0 && ` · earns ${Number(i.apy)}%`}
            </span>
          </span>
          <InstantAction
            action={deleteNetWorthItem}
            undoAction={undoRestore}
            values={{ id: i.id }}
            message={`Removed ${i.name}.`}
            className={delCls}
          >
            remove
          </InstantAction>
        </li>
      ))}
    </ul>
  );
}

function AddForm({ kind }: { kind: "asset" | "liability" }) {
  const categories: NetWorthCategory[] =
    kind === "asset"
      ? ["cash", "savings", "investment", "property", "vehicle", "other_asset"]
      : ["credit_card", "student_loan", "auto_loan", "mortgage", "other_debt"];

  return (
    <form action={addNetWorthItem} className="grid grid-cols-2 gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input
        name="name"
        placeholder={kind === "asset" ? "e.g. Ally savings" : "e.g. Visa card"}
        required
        className={`${inputCls} col-span-2`}
      />
      <input
        name="amount"
        type="number"
        step="0.01"
        min="0"
        placeholder={kind === "asset" ? "Current value" : "Amount owed"}
        required
        className={inputCls}
      />
      <select name="category" className={inputCls} defaultValue={categories[0]}>
        {categories.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <label className="col-span-2 text-xs text-slate-400">
        {kind === "asset"
          ? "Interest it earns per year (%) — like 3 for a high-yield savings account. Optional."
          : "Interest this debt charges per year (%) — optional."}
        <input
          name="apy"
          type="number"
          step="0.001"
          min="0"
          placeholder="0"
          className={`${inputCls} mt-1`}
        />
      </label>
      <button className={`${btnCls} col-span-2`}>
        Add {kind === "asset" ? "asset" : "debt"}
      </button>
    </form>
  );
}

export function NetWorthSection({ data }: { data: DashboardData }) {
  const assets = data.netWorth.filter((i) => i.kind === "asset");
  const liabilities = data.netWorth.filter((i) => i.kind === "liability");

  const totalAssets = assets.reduce((s, i) => s + Number(i.amount), 0);
  const totalLiabilities = liabilities.reduce((s, i) => s + Number(i.amount), 0);
  const netWorth = totalAssets - totalLiabilities;
  const liquid = assets
    .filter((i) => LIQUID_CATEGORIES.includes(i.category))
    .reduce((s, i) => s + Number(i.amount), 0);

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Everything you own</p>
          <p className="mt-1 text-3xl font-bold text-white">
            {currency.format(totalAssets)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Everything you owe</p>
          <p className="mt-1 text-3xl font-bold text-white">
            {currency.format(totalLiabilities)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Net worth</p>
          <p
            className={`mt-1 text-3xl font-bold ${
              netWorth >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {currency.format(netWorth)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-3 font-semibold text-white">What you own</h2>
          <ItemList items={assets} />
          {assets.length === 0 && (
            <p className="mb-4 text-sm text-slate-500">
              Start with your checking and savings balances — the app uses your
              cash + savings ({currency.format(liquid)}) as the starting point of
              the projection below.
            </p>
          )}
          <AddForm kind="asset" />
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-3 font-semibold text-white">What you owe</h2>
          <ItemList items={liabilities} />
          {liabilities.length === 0 && (
            <p className="mb-4 text-sm text-slate-500">
              Credit cards, loans, mortgage — anything you&apos;re paying off.
            </p>
          )}
          <AddForm kind="liability" />
        </div>
      </div>
    </section>
  );
}
