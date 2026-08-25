"use client";

/**
 * What a person sees when something breaks. Two rules:
 *
 * 1. Plain language. No status codes, no stack traces, no "an unexpected
 *    error occurred in the RSC payload". If we can't say it in a sentence a
 *    tired person understands at 11pm, we don't say it.
 * 2. A button that actually does something. An error screen with no way
 *    forward is a dead end, and a dead end in a money app is frightening.
 *
 * The technical detail still exists — it goes to the console for me, not to
 * the person trying to check their grocery money.
 */
import { useEffect } from "react";

export function ErrorPanel({
  error,
  reset,
  what = "this screen",
}: {
  error: Error & { digest?: string };
  /** Re-runs the failed render. Provided by Next's error boundary. */
  reset: () => void;
  /** What failed, in the user's words: "your budget", "this screen". */
  what?: string;
}) {
  useEffect(() => {
    // Developers get the detail; users get a sentence.
    console.error("Till Payday error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6">
        <h1 className="text-xl font-bold text-amber-200">
          {`We couldn't load ${what}.`}
        </h1>
        <p className="mt-2 text-sm text-amber-100/80">
          Your numbers are safe — this is a problem showing them, not a problem
          with your data. Nothing was changed or lost.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-emerald-400 hover:text-white"
          >
            Back to the dashboard
          </a>
        </div>
        <p className="mt-4 text-xs text-slate-400">
          If it keeps happening, there&apos;s a &ldquo;Send feedback&rdquo; box
          in Settings — telling me what you were doing is genuinely the fastest
          way to get it fixed.
        </p>
      </div>
    </div>
  );
}
