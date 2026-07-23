import Link from "next/link";
import { LegalFooter } from "@/components/LegalFooter";

export default function TermsPage() {
  return (
    <main className="flex min-h-screen flex-col bg-slate-950">
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 pt-10">
        <Link href="/legal" className="text-sm text-slate-500 transition hover:text-slate-300">
          ← About &amp; Legal
        </Link>
        <h1 className="mt-4 text-3xl font-black text-white">Terms of Service</h1>
        <p className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
          Coming soon. Until then, the{" "}
          <Link href="/legal" className="text-emerald-300 hover:text-emerald-200">
            About &amp; Legal page
          </Link>{" "}
          explains what Till Payday is and isn&apos;t.
        </p>
      </div>
      <LegalFooter />
    </main>
  );
}
