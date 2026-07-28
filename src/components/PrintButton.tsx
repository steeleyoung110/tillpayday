"use client";

/** window.print() — the browser's print dialog doubles as save-as-PDF. */
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-emerald-400 hover:text-white"
    >
      Print / save as PDF
    </button>
  );
}
