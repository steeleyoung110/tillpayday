"use client";

/**
 * Import spending from a bank/card CSV: pick the file, confirm which columns
 * are date/description/amount, choose the bucket it drains, preview, import.
 * No bank connection, no third parties — just a file you already have.
 * One Undo removes the whole import.
 */
import { useRef, useState, useTransition } from "react";
import { bulkAddExpenses, undoRestore } from "@/app/actions";
import { showToast } from "@/components/InstantAction";
import { extractSpends, guessColumn, parseCsv } from "@/lib/csv";

const cents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400";

export function CsvImport({
  buckets,
  defaultBucketId = "",
}: {
  buckets: { id: string; name: string }[];
  defaultBucketId?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [dateCol, setDateCol] = useState(0);
  const [nameCol, setNameCol] = useState(1);
  const [amountCol, setAmountCol] = useState(2);
  const [negIsSpend, setNegIsSpend] = useState(true);
  const [bucketId, setBucketId] = useState(defaultBucketId);
  const [pending, startTransition] = useTransition();

  const onFile = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      showToast("That file has no data rows.");
      return;
    }
    const headers = rows[0];
    setDateCol(Math.max(0, guessColumn(headers, ["date", "posted"])));
    setNameCol(Math.max(0, guessColumn(headers, ["description", "merchant", "name", "payee", "memo"])));
    setAmountCol(Math.max(0, guessColumn(headers, ["amount", "debit", "value"])));
    setGrid(rows);
  };

  const headers = grid?.[0] ?? [];
  const body = grid?.slice(1) ?? [];
  const candidates = extractSpends(
    body,
    { date: dateCol, name: nameCol, amount: amountCol },
    negIsSpend,
  );

  const doImport = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("bucket_id", bucketId);
      fd.append("rows", JSON.stringify(candidates));
      const recipe = await bulkAddExpenses(fd);
      const bucketName =
        buckets.find((b) => b.id === bucketId)?.name ?? "Savings / leftover";
      setGrid(null);
      if (fileRef.current) fileRef.current.value = "";
      showToast(
        `Imported ${candidates.length} spends into ${bucketName}.`,
        recipe
          ? () => {
              const ufd = new FormData();
              ufd.append("payload", JSON.stringify(recipe));
              void undoRestore(ufd).then(() => showToast("Import removed 👍"));
            }
          : undefined,
      );
    });
  };

  const colPicker = (
    label: string,
    value: number,
    set: (n: number) => void,
  ) => (
    <label className="text-xs text-slate-400">
      {label}
      <select
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        className={`${inputCls} mt-1`}
      >
        {headers.map((h, i) => (
          <option key={`${h}-${i}`} value={i}>
            {h || `column ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
        className="block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-200 hover:file:bg-slate-600"
      />

      {grid && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {colPicker("Date column", dateCol, setDateCol)}
            {colPicker("Description column", nameCol, setNameCol)}
            {colPicker("Amount column", amountCol, setAmountCol)}
            <label className="text-xs text-slate-400">
              Money comes out of
              <select
                value={bucketId}
                onChange={(e) => setBucketId(e.target.value)}
                className={`${inputCls} mt-1`}
              >
                <option value="">Savings / leftover</option>
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={negIsSpend}
              onChange={(e) => setNegIsSpend(e.target.checked)}
              className="accent-emerald-500"
            />
            Negative amounts are spending (how most bank exports work).
            Deposits and refunds are skipped either way.
          </label>

          {candidates.length > 0 ? (
            <>
              <ul className="space-y-1 text-xs text-slate-400">
                {candidates.slice(0, 5).map((c, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{`${c.due_date} — ${c.name}`}</span>
                    <span>{cents.format(c.amount)}</span>
                  </li>
                ))}
                {candidates.length > 5 && (
                  <li className="text-slate-400">{`…and ${candidates.length - 5} more`}</li>
                )}
              </ul>
              <button
                onClick={doImport}
                disabled={pending}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
              >
                {`Import ${candidates.length} spend${candidates.length === 1 ? "" : "s"}`}
              </button>
            </>
          ) : (
            <p className="text-xs text-amber-300">
              No importable rows with these column picks — check the date,
              description, and amount columns above (or the negative-amounts
              toggle).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
