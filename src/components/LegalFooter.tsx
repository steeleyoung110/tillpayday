import Link from "next/link";

/**
 * Site footer (phase 11): About & Legal links on every screen, plus the
 * one-line disclaimer wherever projections / safe-to-spend / Grow math shows.
 */
export function LegalFooter({ disclaimer = false }: { disclaimer?: boolean }) {
  return (
    <footer className="mx-auto mt-10 max-w-6xl px-6 pb-6 text-center text-xs text-slate-600">
      {disclaimer && (
        <p className="mb-2">
          Educational illustrations based on the numbers you enter — not
          financial advice.
        </p>
      )}
      <p className="space-x-3">
        <Link href="/legal" className="transition hover:text-slate-400">
          About &amp; Legal
        </Link>
        <span>·</span>
        <Link href="/legal/terms" className="transition hover:text-slate-400">
          Terms of Service
        </Link>
        <span>·</span>
        <Link href="/legal/privacy" className="transition hover:text-slate-400">
          Privacy Policy
        </Link>
      </p>
    </footer>
  );
}
