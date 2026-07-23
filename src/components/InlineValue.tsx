"use client";

/**
 * Inline-editable dollar value (9B): click the number, type, Enter or click
 * away — it auto-saves, updates today's snapshot, and toasts with Undo.
 */
import { useState, useTransition } from "react";
import { undoRestore, updateItemValue } from "@/app/actions";
import { showToast } from "@/components/InstantAction";

const cents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function InlineValue({
  table,
  id,
  name,
  value,
}: {
  table: "assets" | "liabilities";
  id: string;
  name: string;
  value: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [pending, startTransition] = useTransition();

  const save = () => {
    setEditing(false);
    const next = Number(draft);
    if (!Number.isFinite(next) || next < 0 || next === value) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("table", table);
      fd.append("id", id);
      fd.append("value", String(next));
      const recipe = await updateItemValue(fd);
      showToast(
        `${name} updated to ${cents.format(next)}.`,
        recipe
          ? () =>
              startTransition(async () => {
                const ufd = new FormData();
                ufd.append("payload", JSON.stringify(recipe));
                await undoRestore(ufd);
                showToast(`${name} back to ${cents.format(value)}.`);
              })
          : undefined,
      );
    });
  };

  if (!editing) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        title="Click to update"
        className="rounded px-1 font-semibold text-white underline decoration-slate-600 decoration-dotted underline-offset-4 transition hover:decoration-emerald-400"
      >
        {cents.format(value)}
      </button>
    );
  }

  return (
    <input
      autoFocus
      type="number"
      inputMode="decimal"
      min="0"
      step="0.01"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
      className="w-28 rounded-lg border border-emerald-400 bg-slate-800 px-2 py-0.5 text-right text-sm text-white outline-none"
    />
  );
}
