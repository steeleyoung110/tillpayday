"use client";

/**
 * Statement Drop: hand it a PDF — a card statement or a paycheck stub — and
 * Claude reads it into transactions, each pre-sorted into your buckets by
 * meaning (McDonald's → your food bucket). You review every row before
 * anything is saved; imports arrive with a 5-second undo. Paycheck stubs are
 * recognized and offered as logged income instead.
 */
import { useRef, useState, useTransition } from "react";
import { bulkAddExpensesTagged, logIncome, undoRestore } from "@/app/actions";
import { showToast } from "@/components/InstantAction";
import { redactSensitive } from "@/lib/redact";
import { bucketForCategory, type MappableBucket } from "@/lib/statementMap";

/** Extract a PDF's text in the browser (pdf.js). "" for scanned/image PDFs. */
async function extractPdfText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: buf });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    pages.push(
      tc.items
        .map((it) => ("str" in it ? it.str : ""))
        .join(" "),
    );
  }
  await task.destroy();
  return pages.join("\n").trim();
}

const cents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

interface Row {
  include: boolean;
  date: string;
  name: string;
  amount: number;
  category: string;
  bucketId: string;
}

interface Paystub {
  pay_date: string;
  net_pay: number;
  employer: string | null;
}

export function StatementImport({ buckets }: { buckets: MappableBucket[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [paystub, setPaystub] = useState<Paystub | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scanPending, setScanPending] = useState<ArrayBuffer | null>(null);
  const [pending, startTransition] = useTransition();

  const options = [
    { id: "", name: "Savings / leftover" },
    ...buckets.filter((b) => !b.is_savings).map((b) => ({ id: b.id, name: b.name })),
  ];

  const submitToReader = async (payload: { text?: string; base64?: string }) => {
    const res = await fetch("/api/parse-statement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as {
      ok: boolean;
      reason?: string;
      kind?: string;
      transactions?: { date: string; name: string; amount: number; category: string }[];
      paystub?: Paystub | null;
    };
    if (!body.ok) {
      setError(body.reason ?? "Couldn't read that document.");
    } else if (body.kind === "paystub" && body.paystub) {
      setPaystub(body.paystub);
    } else if ((body.transactions ?? []).length === 0) {
      setError("Read the document, but found no charges in it.");
    } else {
      setRows(
        body.transactions!.map((t) => ({
          include: true,
          date: t.date,
          name: t.name,
          amount: t.amount,
          category: t.category,
          bucketId: bucketForCategory(t.category, buckets),
        })),
      );
    }
  };

  const toBase64 = (buf: ArrayBuffer): string => {
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setNotice(null);
    setRows(null);
    setPaystub(null);
    setScanPending(null);
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("PDFs only here — CSV files go in the importer below.");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError("That file is over 6 MB — statements are usually much smaller.");
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();

      // Redaction-first: pull the text out locally and mask sensitive
      // numbers BEFORE anything leaves this browser.
      let text = "";
      try {
        text = await extractPdfText(buf.slice(0));
      } catch {
        text = "";
      }

      if (text.length >= 200) {
        const { text: safe, redactions } = redactSensitive(text);
        setNotice(
          redactions > 0
            ? `🔒 Redacted ${redactions} account/card number${redactions === 1 ? "" : "s"} in your browser before upload — the raw PDF never left this device.`
            : "🔒 Text extracted in your browser — the raw PDF never left this device. No account numbers found to redact.",
        );
        await submitToReader({ text: safe });
      } else {
        // Scanned/image PDF: local redaction is impossible. Ask first.
        setScanPending(buf);
      }
    } catch {
      setError("Upload failed — try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const sendScanAnyway = async () => {
    if (!scanPending) return;
    setBusy(true);
    setError(null);
    try {
      const base64 = toBase64(scanPending);
      setScanPending(null);
      setNotice("Sent as full PDF (scanned document — local redaction wasn't possible).");
      await submitToReader({ base64 });
    } catch {
      setError("Upload failed — try again.");
    } finally {
      setBusy(false);
    }
  };

  const doImport = () =>
    startTransition(async () => {
      const chosen = (rows ?? []).filter((r) => r.include);
      const fd = new FormData();
      fd.append(
        "rows",
        JSON.stringify(
          chosen.map((r) => ({
            name: r.name,
            amount: r.amount,
            due_date: r.date,
            bucket_id: r.bucketId || null,
          })),
        ),
      );
      const recipe = await bulkAddExpensesTagged(fd);
      showToast(
        `Imported ${chosen.length} transaction${chosen.length === 1 ? "" : "s"}.`,
        recipe
          ? () => {
              const f = new FormData();
              f.append("payload", JSON.stringify(recipe));
              void undoRestore(f);
            }
          : undefined,
      );
      setRows(null);
    });

  const logStub = () =>
    startTransition(async () => {
      if (!paystub) return;
      const fd = new FormData();
      fd.append("amount", String(paystub.net_pay));
      fd.append("received_date", paystub.pay_date);
      fd.append("note", paystub.employer ?? "paycheck");
      await logIncome(fd);
      showToast(`Logged ${cents.format(paystub.net_pay)} income on ${paystub.pay_date}.`);
      setPaystub(null);
    });

  return (
    <div>
      <label className="flex cursor-pointer items-center gap-3">
        <span className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
          {busy ? "Reading…" : "Drop a PDF statement"}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          disabled={busy}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <span className="text-xs text-slate-500">
          Card statement or paycheck stub. Nothing saves until you review.
        </span>
      </label>

      {error && (
        <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {error}
        </p>
      )}

      {notice && (
        <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {notice}
        </p>
      )}

      {scanPending && (
        <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-200">
            This looks like a scanned statement — there&apos;s no text layer,
            so account numbers can&apos;t be redacted in your browser.
          </p>
          <p className="mt-1 text-xs text-amber-100/70">
            Reading it means sending the full PDF, unredacted, to the reader
            (Anthropic API, 30-day retention). Your call.
          </p>
          <div className="mt-2 flex gap-3">
            <button
              onClick={sendScanAnyway}
              disabled={busy}
              className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/30"
            >
              Send the full PDF anyway
            </button>
            <button
              onClick={() => setScanPending(null)}
              className="text-sm text-slate-400 transition hover:text-slate-200"
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {paystub && (
        <div className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="text-sm font-semibold text-emerald-200">
            {`This looks like a paycheck stub: ${cents.format(paystub.net_pay)} net on ${paystub.pay_date}${paystub.employer ? ` from ${paystub.employer}` : ""}.`}
          </p>
          <div className="mt-2 flex gap-3">
            <button
              onClick={logStub}
              disabled={pending}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Log it as income
            </button>
            <button
              onClick={() => setPaystub(null)}
              className="text-sm text-slate-400 transition hover:text-slate-200"
            >
              never mind
            </button>
          </div>
        </div>
      )}

      {rows && (
        <div className="mt-3">
          <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="p-2" />
                  <th className="p-2 font-semibold">Date</th>
                  <th className="p-2 font-semibold">Merchant</th>
                  <th className="p-2 font-semibold">Amount</th>
                  <th className="p-2 font-semibold">Comes out of</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-t border-slate-800 ${r.include ? "" : "opacity-40"}`}>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={() =>
                          setRows(rows.map((x, j) => (j === i ? { ...x, include: !x.include } : x)))
                        }
                        className="accent-emerald-500"
                      />
                    </td>
                    <td className="p-2 text-slate-400">{r.date}</td>
                    <td className="p-2 text-slate-200">{r.name}</td>
                    <td className="p-2 text-red-300">{`−${cents.format(r.amount)}`}</td>
                    <td className="p-2">
                      <select
                        value={r.bucketId}
                        onChange={(e) =>
                          setRows(rows.map((x, j) => (j === i ? { ...x, bucketId: e.target.value } : x)))
                        }
                        className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs text-white"
                      >
                        {options.map((o) => (
                          <option key={o.id || "sv"} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {`${rows.filter((r) => r.include).length} of ${rows.length} selected · ${cents.format(rows.filter((r) => r.include).reduce((s, r) => s + r.amount, 0))} total · buckets guessed by meaning — fix any I got wrong`}
            </p>
            <button
              onClick={doImport}
              disabled={pending || rows.every((r) => !r.include)}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {pending ? "Importing…" : "Import selected"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
