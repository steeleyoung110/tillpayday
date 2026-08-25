"use client";

/**
 * The floating "+" — add anything from anywhere. Three things a person
 * actually adds mid-thought: money that left (a spend), money they're
 * considering (a what-if), and money that arrived (income).
 *
 * Sits in the thumb zone above the mobile tab bar, opens a bottom sheet
 * rather than navigating away, and remembers nothing you didn't ask it to.
 */
import { useEffect, useState, useTransition } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { MoneyInput } from "@/components/MoneyInput";
import { showToast } from "@/components/InstantAction";
import { addExpense, addWhatIf, logIncome } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { isOffline } from "@/components/OfflineBadge";
import { lastBucket, rememberBucket } from "@/lib/lastBucket";

type Mode = "menu" | "expense" | "whatif" | "income";

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400";
const labelCls = "block text-xs text-slate-400";
const submitCls =
  "w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50";

export interface QuickAddBucket {
  id: string;
  name: string;
}

export function QuickAdd({
  buckets,
  todayISO,
  fallbackBucketId,
}: {
  buckets: QuickAddBucket[];
  todayISO: string;
  /** Used until we know what they picked last (usually the fun bucket). */
  fallbackBucketId: string;
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // localStorage isn't there during SSR, so start with the fallback and
  // upgrade to the remembered bucket once mounted.
  const [defaultBucketId, setDefaultBucketId] = useState(fallbackBucketId);
  useEffect(() => {
    setDefaultBucketId(lastBucket(buckets.map((b) => b.id), fallbackBucketId));
  }, [buckets, fallbackBucketId]);

  const close = () => {
    setOpen(false);
    setMode("menu");
  };

  const submit = (fd: FormData, kind: Mode) => {
    if (isOffline()) {
      showToast("You're offline — that didn't save. Try again once you're back.");
      return;
    }
    return startTransition(async () => {
      if (kind === "expense") {
        const bucketId = String(fd.get("bucket_id") ?? "");
        rememberBucket(bucketId);
        await addExpense(fd);
        showToast(`Logged ${fd.get("name")}.`);
      } else if (kind === "whatif") {
        await addWhatIf(fd);
        showToast(`Added "${fd.get("name")}" to your what-ifs.`);
      } else {
        await logIncome(fd);
        showToast("Income logged.");
      }
      haptic(kind === "whatif" ? "skip" : "save");
      close();
    });
  };

  const title =
    mode === "expense"
      ? "Log a spend"
      : mode === "whatif"
        ? "Thinking about buying"
        : mode === "income"
          ? "Money arrived"
          : "Add something";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Add a spend, what-if, or income"
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-3xl font-light text-slate-950 shadow-lg transition hover:bg-emerald-400 md:bottom-8 md:right-8"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <span aria-hidden>+</span>
      </button>

      <BottomSheet open={open} onClose={close} title={title}>
        {mode === "menu" && (
          <div className="space-y-2">
            {(
              [
                ["expense", "💸", "A spend", "Money that just left"],
                ["whatif", "🤔", "A what-if", "Something you're considering"],
                ["income", "💰", "Income", "Money that arrived"],
              ] as const
            ).map(([key, icon, label, hint]) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-left transition hover:border-emerald-400/60"
              >
                <span className="text-2xl" aria-hidden>
                  {icon}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-100">{label}</span>
                  <span className="block text-xs text-slate-400">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {mode === "expense" && (
          <form
            action={(fd) => submit(fd, "expense")}
            className="space-y-3"
          >
            <label className={labelCls}>
              What was it?
              <input name="name" required autoFocus placeholder="Groceries" className={`${inputCls} mt-1`} />
            </label>
            <label className={labelCls}>
              How much?
              <MoneyInput name="amount" required className={`${inputCls} mt-1`} ariaLabel="Amount" />
            </label>
            <label className={labelCls}>
              Comes out of
              <select name="bucket_id" defaultValue={defaultBucketId} className={`${inputCls} mt-1`}>
                <option value="">Savings / leftover</option>
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            {/* Smart defaults: today, one-time. Changeable in Budget. */}
            <input type="hidden" name="due_date" value={todayISO} />
            <input type="hidden" name="cadence" value="one_time" />
            <button disabled={pending} className={submitCls}>
              {pending ? "Logging…" : "Log it"}
            </button>
          </form>
        )}

        {mode === "whatif" && (
          <form action={(fd) => submit(fd, "whatif")} className="space-y-3">
            <label className={labelCls}>
              What are you eyeing?
              <input name="name" required autoFocus placeholder="New headphones" className={`${inputCls} mt-1`} />
            </label>
            <label className={labelCls}>
              How much?
              <MoneyInput name="amount" required className={`${inputCls} mt-1`} ariaLabel="Amount" />
            </label>
            <label className={labelCls}>
              Comes out of
              <select name="bucket_id" defaultValue={defaultBucketId} className={`${inputCls} mt-1`}>
                <option value="">Savings / leftover</option>
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <input type="hidden" name="target_date" value={todayISO} />
            <button disabled={pending} className={submitCls}>
              {pending ? "Adding…" : "Add it"}
            </button>
            <p className="text-xs text-slate-400">
              Nothing is spent yet — this parks it so you can see what it
              would cost you before you decide.
            </p>
          </form>
        )}

        {mode === "income" && (
          <form action={(fd) => submit(fd, "income")} className="space-y-3">
            <label className={labelCls}>
              How much arrived?
              <MoneyInput name="amount" required autoFocus className={`${inputCls} mt-1`} ariaLabel="Amount" />
            </label>
            <label className={labelCls}>
              What was it?
              <input name="note" placeholder="Paycheck" className={`${inputCls} mt-1`} />
            </label>
            <input type="hidden" name="received_date" value={todayISO} />
            <button disabled={pending} className={submitCls}>
              {pending ? "Logging…" : "Log it"}
            </button>
          </form>
        )}

        {mode !== "menu" && (
          <button
            onClick={() => setMode("menu")}
            className="mt-3 w-full text-center text-xs text-slate-400 transition hover:text-slate-300"
          >
            ← something else
          </button>
        )}
      </BottomSheet>
    </>
  );
}
