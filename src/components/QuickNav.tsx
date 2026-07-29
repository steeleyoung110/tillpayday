"use client";

/**
 * Ctrl+K (or Cmd+K) quick-nav: type a few letters, hit Enter, you're there.
 * Bonus: type an amount + name ("12.50 mcdonalds") and Enter LOGS it — the
 * server action parses and drops it in the fun bucket. The fastest path for
 * the most frequent action in any budget app.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { quickLogSpend } from "@/app/actions";
import { showToast } from "@/components/InstantAction";

const SPEND_RE = /^\$?(\d+(?:\.\d{1,2})?)\s+(.{2,60})$/;

const DESTINATIONS: { label: string; href: string; keywords: string }[] = [
  { label: "Dashboard", href: "/", keywords: "home safe to spend runway" },
  { label: "Budget", href: "/budget", keywords: "plan buckets money" },
  { label: "Bills & spending", href: "/budget#bills", keywords: "expenses log spend search" },
  { label: "Buckets", href: "/budget#buckets", keywords: "envelopes split allocation" },
  { label: "Income", href: "/budget#income", keywords: "paycheck job wages" },
  { label: "Goals", href: "/budget#goals", keywords: "targets saving" },
  { label: "What-ifs", href: "/budget#what-ifs", keywords: "purchase considering cooloff" },
  { label: "Net worth", href: "/net-worth", keywords: "assets debts liabilities snowball" },
  { label: "Grow", href: "/grow", keywords: "compound interest loan raise calculator" },
  { label: "Month wrapped", href: "/wrapped", keywords: "report card monthly grades" },
  { label: "Year wrapped", href: "/wrapped/year", keywords: "annual report interest ledger" },
  { label: "Weekly review", href: "/review", keywords: "checkin ritual streak sunday" },
  { label: "Crisis mode", href: "/crisis", keywords: "job loss emergency worst case pause" },
  { label: "Settings & About", href: "/settings", keywords: "account notifications calendar wage share" },
];

export function QuickNav() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const spendMatch = q.trim().match(SPEND_RE);

  const logSpend = () => {
    if (!spendMatch || pending) return;
    const raw = q.trim();
    startTransition(async () => {
      const fd = new FormData();
      fd.append("text", raw);
      const res = await quickLogSpend(fd);
      if (res.ok) {
        showToast(
          `Logged ${res.name} — $${res.amount?.toFixed(2)} out of ${res.bucketName}.`,
        );
        setOpen(false);
        setQ("");
        router.refresh();
      } else {
        showToast("Couldn't parse that — try “12.50 mcdonalds”.");
      }
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQ("");
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle === "") return DESTINATIONS;
    return DESTINATIONS.filter(
      (d) =>
        d.label.toLowerCase().includes(needle) || d.keywords.includes(needle),
    );
  }, [q]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/80 p-6 pt-24 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            if (spendMatch) logSpend();
            else if (matches[0]) go(matches[0].href);
          }}
          placeholder="Jump to… or log a spend: 12.50 mcdonalds"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
        />
        <ul className="mt-2 max-h-72 overflow-y-auto">
          {spendMatch && (
            <li>
              <button
                onClick={logSpend}
                disabled={pending}
                className="w-full rounded-lg bg-emerald-500/15 px-3 py-2 text-left text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
              >
                {pending
                  ? "Logging…"
                  : `💸 Log $${Number(spendMatch[1]).toFixed(2)} · ${spendMatch[2].trim()}`}
                <span className="ml-2 text-xs font-normal text-emerald-200/60">
                  goes to your fun bucket, today
                </span>
              </button>
            </li>
          )}
          {matches.map((d, i) => (
            <li key={d.href}>
              <button
                onClick={() => go(d.href)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-800 ${
                  i === 0 ? "bg-slate-800/60 text-white" : "text-slate-300"
                }`}
              >
                {d.label}
                <span className="ml-2 text-xs text-slate-500">{d.href}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">No matches.</li>
          )}
        </ul>
        <p className="mt-2 px-1 text-xs text-slate-600">
          Ctrl+K toggles · Esc closes · Enter opens the top match
        </p>
      </div>
    </div>
  );
}
