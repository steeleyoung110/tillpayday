"use client";

/**
 * Mobile editing without leaving the page. The desktop rows carry their
 * controls inline — fine with a mouse and a wide screen, cramped and
 * mis-tappable on a phone. On small screens those controls collapse behind
 * one "Edit" button that opens a bottom sheet holding the same forms.
 *
 * The forms themselves are passed in as children, so they stay Server
 * Components wired to the same Server Actions — no duplicate logic, no
 * second code path that can drift.
 */
import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";

export function RowEditSheet({
  title,
  label = "Edit",
  children,
  everywhere = false,
  hint = "Changes save as you make them — close when you're done.",
}: {
  /** What's being edited, shown as the sheet's heading. */
  title: string;
  label?: string;
  children: React.ReactNode;
  /**
   * Keep the button on wide screens too. For rows whose controls collapse
   * into this sheet on phones the button is phone-only — but a row with no
   * inline controls at all (what-ifs) needs it at every width.
   */
  everywhere?: boolean;
  /** Footnote under the forms; some sheets have something else to say. */
  hint?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Edit ${title}`}
        className={`rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300 transition hover:border-emerald-400 hover:text-white ${
          everywhere ? "" : "sm:hidden"
        }`}
      >
        {label}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="space-y-4 [&_form]:flex-wrap">{children}</div>
        <p className="mt-4 text-xs text-slate-400">{hint}</p>
      </BottomSheet>
    </>
  );
}
