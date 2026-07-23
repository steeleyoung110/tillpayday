"use client";

/**
 * Undo instead of "are you sure?" (8E): routine actions apply instantly and a
 * 5-second toast offers to put things back. The server action returns an undo
 * recipe (rows to re-insert / fields to restore); Undo hands it to
 * undoRestore. No confirmation dialogs for everyday actions.
 */
import { useEffect, useRef, useState, useTransition } from "react";

type ServerAction = (formData: FormData) => Promise<unknown>;

interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

let pushToast: ((t: Omit<Toast, "id">) => void) | null = null;
let nextId = 1;

/** Mount once (in the root layout). Renders the toast stack. */
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    pushToast = (t) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-2), { ...t, id }]);
      timers.current.set(
        id,
        setTimeout(() => {
          setToasts((prev) => prev.filter((x) => x.id !== id));
          timers.current.delete(id);
        }, 5000),
      );
    };
    return () => {
      pushToast = null;
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const dismiss = (id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  };

  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 left-1/2 z-[60] w-full max-w-md -translate-x-1/2 space-y-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center justify-between gap-4 rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm text-slate-100 shadow-2xl"
        >
          <span>{t.message}</span>
          <span className="flex shrink-0 items-center gap-3">
            {t.undo && (
              <button
                onClick={() => {
                  t.undo!();
                  dismiss(t.id);
                }}
                className="font-bold text-emerald-300 transition hover:text-emerald-200"
              >
                Undo
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              className="text-slate-500 transition hover:text-slate-300"
              aria-label="Dismiss"
            >
              ×
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * A button that runs a server action immediately and toasts with Undo.
 * `values` become the action's FormData; the action's return value (the undo
 * recipe) is forwarded to `undoAction` if the user hits Undo in time.
 */
export function InstantAction({
  action,
  undoAction,
  values,
  message,
  undoneMessage = "Put back 👍",
  className,
  title,
  children,
}: {
  action: ServerAction;
  undoAction?: ServerAction;
  values: Record<string, string>;
  message: string;
  undoneMessage?: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title={title}
      className={className}
      onClick={() =>
        startTransition(async () => {
          const fd = new FormData();
          for (const [k, v] of Object.entries(values)) fd.append(k, v);
          const recipe = await action(fd);
          pushToast?.({
            message,
            undo:
              recipe && undoAction
                ? () => {
                    startTransition(async () => {
                      const ufd = new FormData();
                      ufd.append("payload", JSON.stringify(recipe));
                      await undoAction(ufd);
                      pushToast?.({ message: undoneMessage });
                    });
                  }
                : undefined,
          });
        })
      }
    >
      {children}
    </button>
  );
}
