import { signIn, signInWithGoogle, signUp } from "@/app/actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupNotice } from "@/components/SetupNotice";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">
            Till <span className="text-emerald-400">Payday</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Plan your paychecks. See your future savings.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}
        {message && (
          <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">
            {message}
          </p>
        )}

        <form className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm text-slate-300">
              Name <span className="text-slate-500">(for sign-up)</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="What should we call you?"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-slate-300">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-slate-300">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              formAction={signIn}
              className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Sign in
            </button>
            <button
              formAction={signUp}
              className="flex-1 rounded-lg border border-slate-600 px-4 py-2 font-semibold text-slate-200 transition hover:border-slate-400"
            >
              Sign up
            </button>
          </div>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-slate-500">
          <div className="h-px flex-1 bg-slate-800" />
          or
          <div className="h-px flex-1 bg-slate-800" />
        </div>

        <form action={signInWithGoogle}>
          <button className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 font-semibold text-slate-200 transition hover:border-slate-400">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.63h6.46a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.28a7.21 7.21 0 0 1 0-4.56V6.61H1.27a12 12 0 0 0 0 10.78l4.01-3.11Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z"
              />
            </svg>
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}
