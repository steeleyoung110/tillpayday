"use client";

/**
 * Per-property document vault: ALTAs, leases, statements. Files live in the
 * private `property-docs` bucket under <user>/<property>/, where storage RLS
 * lets only their owner see them; links below are short-lived signed URLs.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { showToast } from "@/components/InstantAction";

const MAX_BYTES = 20 * 1024 * 1024;

export interface PropertyDoc {
  name: string;
  url: string;
  sizeKB: number | null;
}

export function PropertyDocs({
  userId,
  propertyId,
  docs,
}: {
  userId: string;
  propertyId: string;
  docs: PropertyDoc[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      showToast("That file is over 20 MB — too big for the vault.");
      return;
    }
    setBusy(true);
    const clean = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    const { error } = await createClient()
      .storage.from("property-docs")
      .upload(`${userId}/${propertyId}/${clean}`, file, { upsert: true });
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (error) {
      showToast(`Upload failed: ${error.message}`);
      return;
    }
    showToast(`${clean} filed with this property.`);
    startTransition(() => router.refresh());
  }

  async function remove(name: string) {
    const { error } = await createClient()
      .storage.from("property-docs")
      .remove([`${userId}/${propertyId}/${name}`]);
    if (error) {
      showToast(`Couldn't delete: ${error.message}`);
      return;
    }
    showToast(`${name} deleted.`);
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <ul className="space-y-1.5">
        {docs.length === 0 && (
          <li className="text-sm text-slate-400">
            Nothing filed yet — ALTAs, leases, and statements belong here.
          </li>
        )}
        {docs.map((d) => (
          <li key={d.name} className="flex items-center justify-between gap-3 text-sm">
            <a
              href={d.url}
              target="_blank"
              rel="noreferrer"
              className="truncate text-emerald-300 underline-offset-2 hover:underline"
            >
              {d.name}
            </a>
            <span className="flex shrink-0 items-center gap-3">
              {d.sizeKB != null && (
                <span className="text-xs text-slate-500">{`${d.sizeKB.toLocaleString()} KB`}</span>
              )}
              <button
                type="button"
                onClick={() => remove(d.name)}
                className="text-xs text-slate-400 transition hover:text-red-400"
              >
                delete
              </button>
            </span>
          </li>
        ))}
      </ul>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.csv,.html,.doc,.docx,.xls,.xlsx,.txt"
        aria-label="Upload a document for this property"
        disabled={busy}
        onChange={(e) => upload(e.target.files?.[0])}
        className="mt-3 block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-600"
      />
      {busy && <p className="mt-2 text-xs text-slate-400">Uploading…</p>}
    </div>
  );
}
