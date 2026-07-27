"use client";

/**
 * "Honest recap" card: one button, one plain-English recap of your real
 * numbers — kind wording, brutal math, written by Claude from aggregates
 * the server computes. Rendered only when the server has an API key.
 */
import { useState, useTransition } from "react";

export function CoachRecap() {
  const [recap, setRecap] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const generate = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/recap", { method: "POST" });
        const body = (await res.json()) as { ok: boolean; recap?: string; reason?: string };
        if (body.ok && body.recap) setRecap(body.recap);
        else setError(body.reason ?? "Something went wrong — try again.");
      } catch {
        setError("Couldn't reach the recap writer — try again.");
      }
    });

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-white">Your honest recap 🪞</h2>
          <p className="mt-1 text-xs text-slate-500">
            Your real numbers, read back to you straight — kind wording,
            brutal math. Educational reflection, not financial advice.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={pending}
          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {pending ? "Reading your numbers…" : recap ? "Read them again" : "Read my numbers back to me"}
        </button>
      </div>
      {error && (
        <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {error}
        </p>
      )}
      {recap && (
        <div className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-800/60 p-4 text-sm leading-relaxed text-slate-200">
          {recap}
        </div>
      )}
    </div>
  );
}
