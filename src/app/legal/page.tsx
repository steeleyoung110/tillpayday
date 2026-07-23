import Link from "next/link";
import { LegalFooter } from "@/components/LegalFooter";

/** About & Legal (phase 11) — the provided document, verbatim. Public page. */
export default function AboutLegalPage() {
  return (
    <main className="min-h-screen bg-slate-950 pb-8">
      <div className="mx-auto max-w-3xl px-6 pt-10">
        <Link href="/" className="text-sm text-slate-500 transition hover:text-slate-300">
          ← Back to Till Payday
        </Link>
        <h1 className="mt-4 text-3xl font-black text-white">About Till Payday</h1>

        <div className="mt-8 space-y-6 text-slate-300">
          <section>
            <h2 className="font-bold text-white">What this app is.</h2>
            <p className="mt-1 leading-relaxed">
              Till Payday is an educational budgeting and money-simulation
              tool. It exists to help you build better money habits by letting
              you practice: you enter your own numbers, and the app illustrates
              how choices like bucketing a paycheck, skipping a purchase, or
              paying down a loan could play out over time.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-white">What this app is not.</h2>
            <p className="mt-1 leading-relaxed">
              Till Payday is not a bank, a financial institution, a broker, or
              a financial advisor. Nothing in this app is financial,
              investment, legal, tax, or accounting advice, and nothing here is
              a recommendation to buy, sell, save, borrow, pay off, or invest
              in anything. The app shows you math; decisions are yours. For
              advice about your specific situation, consult a qualified
              professional such as a licensed financial advisor, accountant, or
              attorney.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-white">
              Projections are illustrations, not predictions.
            </h2>
            <p className="mt-1 leading-relaxed">
              Every chart, projection, &ldquo;safe to spend&rdquo; figure,
              payoff timeline, and growth curve in Till Payday is a simplified
              educational illustration calculated from numbers you entered and
              assumptions you chose. Real life includes taxes, fees, rate
              changes, market movements, and surprises that these simulations
              do not capture. Actual results will differ — sometimes
              significantly. Figures like investment returns are hypothetical,
              and past or assumed performance never guarantees future results.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-white">
              Your money never touches this app.
            </h2>
            <p className="mt-1 leading-relaxed">
              Till Payday does not connect to your bank, hold funds, move
              money, or process payments. There is nothing to link and nothing
              we can access. Everything in the app is information you typed in
              yourself, and you can edit or delete it at any time.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-white">No guarantees.</h2>
            <p className="mt-1 leading-relaxed">
              The app is provided as-is. While we work to keep the math
              accurate, we don&apos;t guarantee that the app is error-free, and
              we aren&apos;t responsible for financial decisions made based on
              it. Using Till Payday means you understand its projections are
              educational tools, not professional guidance.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-white">Questions?</h2>
            <p className="mt-1 leading-relaxed">Contact us at [contact email].</p>
          </section>
        </div>
      </div>
      <LegalFooter />
    </main>
  );
}
