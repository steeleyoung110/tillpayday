/**
 * First-login setup: three one-tap bucket templates, shown only while the
 * account has no buckets. Choosing one creates the buckets and the dashboard
 * is instantly live; everything stays editable in the panels below.
 */
import { applyTemplate } from "@/app/actions";
import { STARTER_TEMPLATES } from "@/lib/templates";

export function StarterTemplates() {
  return (
    <section className="rounded-2xl border border-emerald-500/40 bg-slate-900 p-6">
      <h2 className="text-xl font-bold text-white">
        Set up your paycheck in one tap
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Pick how each paycheck should split. You can rename, re-balance, or
        delete any bucket afterwards — or skip this and build your own below.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        {STARTER_TEMPLATES.map((t) => (
          <form
            key={t.key}
            action={applyTemplate}
            className="flex flex-col rounded-2xl border border-slate-700 bg-slate-800/50 p-5 transition hover:border-emerald-400/60"
          >
            <input type="hidden" name="template" value={t.key} />
            <h3 className="text-lg font-bold text-white">{t.title}</h3>
            <p className="mt-0.5 text-xs text-slate-400">{t.tagline}</p>
            <ul className="mt-3 flex-1 space-y-1 text-sm text-slate-300">
              {t.breakdown.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
            <button className="mt-4 w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-400">
              {`Use ${t.title}`}
            </button>
          </form>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        💸 = flexible spending money, which powers your daily safe-to-spend
        number. Whatever a template doesn&apos;t allocate flows to Savings
        automatically — and leftovers sweep there every payday.
      </p>
    </section>
  );
}
