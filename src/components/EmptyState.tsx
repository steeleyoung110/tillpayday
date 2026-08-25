"use client";

import { revealTarget } from "@/lib/revealTarget";

/**
 * An empty section should say what it's for and hand you the one action that
 * fills it — not just report its own emptiness. "No buckets yet" tells a new
 * person nothing they can act on.
 *
 * Exactly one button, and it takes you to the field that fixes it: focused,
 * scrolled into view, ready to type.
 */

export function EmptyState({
  line,
  action,
  targetId,
  as: Tag = "li",
}: {
  /** The friendly one-liner. */
  line: string;
  /** Button text — phrase it as the thing about to happen. */
  action: string;
  /** id of the input this should focus. */
  targetId: string;
  /** "li" inside a list, "div" anywhere else — an <li> with no <ul> is invalid. */
  as?: "li" | "div";
}) {
  return (
    <Tag
      className={`rounded-lg border border-dashed border-slate-700 px-3 py-4 text-center ${Tag === "div" ? "mb-4" : ""}`}
    >
      <p className="text-sm text-slate-400">{line}</p>
      <button
        type="button"
        onClick={() => {
          const el = document.getElementById(targetId);
          if (!el) return;
          revealTarget(el);
          // Focus after the scroll starts, so the field isn't yanked out from
          // under the animation on iOS.
          setTimeout(() => el.focus(), 250);
        }}
        className="mt-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
      >
        {action}
      </button>
    </Tag>
  );
}
