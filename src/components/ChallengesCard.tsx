/**
 * Money challenges: the skip-it jar (skipped what-ifs, already tracked), a
 * no-spend week, and the 52-week ladder. Server component — start/stop are
 * server actions on user metadata.
 */
import { addTransfer, setChallenge } from "@/app/actions";
import type { NoSpendStatus, Week52Status } from "@/lib/challenges";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const startBtn =
  "rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30";
const stopBtn = "text-xs text-slate-400 transition hover:text-slate-300";

export function ChallengesCard({
  skippedTotal,
  skippedCount,
  noSpend,
  week52,
  funBucketId,
  todayISO,
}: {
  skippedTotal: number;
  skippedCount: number;
  noSpend: NoSpendStatus | null;
  week52: Week52Status | null;
  funBucketId: string | null;
  todayISO: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="font-semibold text-white">Challenges 🏁</h2>
      <p className="mb-3 mt-1 text-xs text-slate-400">
        Small games, real dollars. Nothing here is required — but every one of
        them ends with more money still yours.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Skip-it jar — powered by what-ifs marked "skipped" */}
        <div className="rounded-xl bg-slate-800/60 p-4">
          <p className="text-xs text-slate-400">Skip-it jar</p>
          <p className="mt-1 text-2xl font-black text-emerald-300">
            {currency.format(skippedTotal)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {skippedCount > 0
              ? `${skippedCount} thing${skippedCount === 1 ? "" : "s"} you almost bought and didn't. Every "skip" in What-ifs feeds this jar.`
              : `Empty so far — mark a What-if "skipped" and watch this grow. Saying no is the highest-paying habit in this app.`}
          </p>
        </div>

        {/* No-spend week */}
        <div className="rounded-xl bg-slate-800/60 p-4">
          <p className="text-xs text-slate-400">No-spend week</p>
          {noSpend === null ? (
            <>
              <p className="mt-1 text-sm text-slate-300">
                Seven days without touching fun money.
              </p>
              <form action={setChallenge} className="mt-2">
                <input type="hidden" name="kind" value="nospend" />
                <button name="state" value="start" className={startBtn}>
                  Start today
                </button>
              </form>
            </>
          ) : noSpend.complete ? (
            <>
              <p className="mt-1 text-2xl font-black text-emerald-300">7 / 7 🎉</p>
              <p className="mt-1 text-xs text-slate-400">
                A full week without fun-money spending. That was real discipline.
              </p>
              <form action={setChallenge} className="mt-2">
                <input type="hidden" name="kind" value="nospend" />
                <button name="state" value="start" className={startBtn}>
                  Run it again
                </button>
              </form>
            </>
          ) : noSpend.failed ? (
            <>
              <p className="mt-1 text-2xl font-black text-red-300">
                {`${noSpend.daysDone} day${noSpend.daysDone === 1 ? "" : "s"}, then ${noSpend.failDate}`}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Fun money moved on {noSpend.failDate} — the week is dead, no
                sugarcoating. Restart when you mean it.
              </p>
              <form action={setChallenge} className="mt-2 flex gap-3">
                <input type="hidden" name="kind" value="nospend" />
                <button name="state" value="start" className={startBtn}>
                  Restart
                </button>
                <button name="state" value="stop" className={stopBtn}>
                  drop it
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="mt-1 text-2xl font-black text-emerald-300">
                {`${noSpend.daysDone} / 7`}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {`Clean through today — runs until ${noSpend.endISO}. Fun-money spending resets it.`}
              </p>
              <form action={setChallenge} className="mt-2">
                <input type="hidden" name="kind" value="nospend" />
                <button name="state" value="stop" className={stopBtn}>
                  give up (honest quit beats a quiet fail)
                </button>
              </form>
            </>
          )}
        </div>

        {/* 52-week ladder */}
        <div className="rounded-xl bg-slate-800/60 p-4">
          <p className="text-xs text-slate-400">52-week ladder</p>
          {week52 === null ? (
            <>
              <p className="mt-1 text-sm text-slate-300">
                {`Week 1 saves $1, week 2 saves $2… week 52 banks the last $52. Total: ${currency.format(1378)}.`}
              </p>
              <form action={setChallenge} className="mt-2">
                <input type="hidden" name="kind" value="week52" />
                <button name="state" value="start" className={startBtn}>
                  Start the ladder
                </button>
              </form>
            </>
          ) : week52.complete ? (
            <>
              <p className="mt-1 text-2xl font-black text-emerald-300">
                {`${currency.format(1378)} 🎉`}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                52 weeks, the whole ladder. Done.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-2xl font-black text-white">
                {`Week ${week52.week}`}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {`This week's rung: ${currency.format(week52.dueThisWeek)}. On pace, the ladder holds ${currency.format(week52.targetToDate)} by Sunday.`}
              </p>
              {funBucketId && (
                <form action={addTransfer} className="mt-2">
                  <input type="hidden" name="from_bucket_id" value={funBucketId} />
                  <input type="hidden" name="to_bucket_id" value="" />
                  <input type="hidden" name="amount" value={week52.dueThisWeek} />
                  <input type="hidden" name="transfer_date" value={todayISO} />
                  <input type="hidden" name="note" value="52-week ladder" />
                  <button className={startBtn}>
                    {`Move this week's ${currency.format(week52.dueThisWeek)} to savings`}
                  </button>
                </form>
              )}
              <form action={setChallenge} className="mt-2">
                <input type="hidden" name="kind" value="week52" />
                <button name="state" value="stop" className={stopBtn}>
                  drop the ladder
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
