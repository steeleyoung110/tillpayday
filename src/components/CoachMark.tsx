"use client";

/**
 * One tip, once, on your first visit to a tab.
 *
 * The discipline is the point: exactly one per screen, pointing at the single
 * thing that screen exists for. A tour that explains six things teaches none
 * of them, and this app already has ninety features — the answer to that is
 * the guide, not a longer tour.
 *
 * Dismissal is stored on the account, so it doesn't reappear on another
 * device, and it dismisses optimistically: nobody should watch a spinner to
 * make a tooltip go away.
 */
import { useState, useTransition } from "react";
import { dismissCoachMark } from "@/app/actions";

export function CoachMark({
  markKey,
  title,
  body,
  seen,
}: {
  /** Stable id for this tip, e.g. "dashboard". */
  markKey: string;
  title: string;
  body: string;
  /** Already dismissed on this account. */
  seen: boolean;
}) {
  const [hidden, setHidden] = useState(seen);
  const [, startTransition] = useTransition();

  if (hidden) return null;

  const dismiss = () => {
    setHidden(true); // optimistic — the write can take its time
    startTransition(async () => {
      const fd = new FormData();
      fd.append("key", markKey);
      await dismissCoachMark(fd);
    });
  };

  return (
    <div
      role="note"
      className="relative rounded-2xl border border-sky-500/40 bg-sky-500/10 px-5 py-4 motion-safe:animate-[slideUp_.2s_ease-out]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-sky-200">{title}</p>
          <p className="mt-1 text-sm text-sky-100/80">{body}</p>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-lg bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/30"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
