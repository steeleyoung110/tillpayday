"use client";

/**
 * Upload and list the paperwork tied to a lease (signed copy) or to a rental
 * report period. The browser uploads straight into the private
 * `property-docs` bucket under <user>/<property>/leases|reports/…, then a
 * Server Action records it. Links are short-lived signed URLs.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePropertyFile, recordPropertyFile } from "@/app/leaseActions";
import { showToast } from "@/components/InstantAction";
import { createClient } from "@/lib/supabase/client";
import type { FileVM } from "@/lib/property/paperwork";

const MAX_BYTES = 20 * 1024 * 1024;

export function PaperworkFiles({
  userId,
  propertyId,
  kind,
  leaseId,
  periodStart,
  files,
  uploadLabel,
  emptyText,
}: {
  userId: string;
  propertyId: string;
  kind: "lease" | "rental_report";
  leaseId?: string;
  periodStart?: string;
  files: FileVM[];
  uploadLabel: string;
  emptyText?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      showToast("That file is over 20 MB. Try a smaller scan or export.");
      return;
    }
    setBusy(true);
    const clean = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
    const folder = kind === "lease" ? `leases/${leaseId ?? "unassigned"}` : `reports/${periodStart ?? "unassigned"}`;
    const path = `${userId}/${propertyId}/${folder}/${Date.now()}-${clean}`;
    const { error } = await createClient().storage.from("property-docs").upload(path, file);
    if (error) {
      setBusy(false);
      showToast(`Upload failed: ${error.message}`);
      return;
    }
    const fd = new FormData();
    fd.set("property_id", propertyId);
    fd.set("kind", kind);
    fd.set("storage_path", path);
    fd.set("file_name", clean);
    fd.set("size_bytes", String(file.size));
    if (leaseId) fd.set("lease_id", leaseId);
    if (periodStart) fd.set("period_start", periodStart);
    const res = await recordPropertyFile(fd);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!res.ok) {
      showToast(res.error ?? "Upload didn't save. Try again.");
      return;
    }
    showToast(`${clean} saved.`);
    startTransition(() => router.refresh());
  }

  function remove(f: FileVM) {
    if (armed !== f.id) {
      setArmed(f.id);
      return;
    }
    setArmed(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", f.id);
      const res = await deletePropertyFile(fd);
      showToast(res.ok ? `${f.name} deleted.` : (res.error ?? "Couldn't delete it."));
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="grid gap-2">
      {files.length === 0 && emptyText && <p className="text-xs text-slate-500">{emptyText}</p>}
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 text-sm">
              <a href={f.url} target="_blank" rel="noreferrer" className="truncate text-emerald-300 underline-offset-2 hover:underline">
                {f.name}
              </a>
              <span className="flex shrink-0 items-center gap-3">
                {f.sizeKB != null && <span className="text-xs text-slate-500">{`${f.sizeKB.toLocaleString()} KB`}</span>}
                <button
                  type="button"
                  onClick={() => remove(f)}
                  onBlur={() => setArmed(null)}
                  className={`text-xs transition ${armed === f.id ? "font-semibold text-red-400" : "text-slate-400 hover:text-red-400"}`}
                >
                  {armed === f.id ? "tap again to delete" : "delete"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-600 px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:border-emerald-500 hover:text-emerald-300">
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept=".pdf,.png,.jpg,.jpeg,.heic,.csv,.doc,.docx,.xls,.xlsx,.txt"
          disabled={busy}
          onChange={(e) => upload(e.target.files?.[0])}
        />
        {busy ? "Uploading…" : uploadLabel}
      </label>
    </div>
  );
}
