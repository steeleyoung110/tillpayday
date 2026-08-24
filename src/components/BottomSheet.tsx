"use client";

/**
 * A bottom sheet for editing in place. On phones it slides up over the
 * screen — thumb-reachable, keeps your scroll position, and never yanks you
 * to another page mid-thought. On desktop the same component centers itself
 * as a modal, so one piece of code serves both.
 *
 * Keyboard and screen readers get the full treatment: Escape closes, focus
 * moves in on open and returns to whatever opened it on close, background
 * scrolling is locked, and it's a labelled dialog.
 */
import { useEffect, useRef } from "react";

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusTo.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // Lock the page behind the sheet so scrolling doesn't leak through.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first real control, or the panel itself.
    const first = panelRef.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]), select, textarea, button",
    );
    (first ?? panelRef.current)?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      returnFocusTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl outline-none sm:max-w-md sm:rounded-3xl motion-safe:animate-[slideUp_.18s_ease-out]"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
      >
        {/* Grab handle: the universal "drag me" affordance on phones. */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-700 sm:hidden" aria-hidden />
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
