/** Shown when the Supabase environment variables are missing. */
export function SetupNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="text-2xl font-bold text-white">
          Till <span className="text-emerald-400">Payday</span> — almost ready
        </h1>
        <p className="mt-3 text-slate-300">
          The app is built, but it isn&apos;t connected to a Supabase project yet.
          Three steps to finish:
        </p>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-slate-300">
          <li>
            Create a free project at{" "}
            <span className="font-mono text-emerald-300">supabase.com</span>.
          </li>
          <li>
            In the project&apos;s <strong>SQL Editor</strong>, run the script in{" "}
            <span className="font-mono text-emerald-300">
              supabase/migrations/0001_init.sql
            </span>{" "}
            to create the tables.
          </li>
          <li>
            Copy <span className="font-mono text-emerald-300">.env.local.example</span>{" "}
            to <span className="font-mono text-emerald-300">.env.local</span> and paste
            in your project&apos;s URL and anon key (Project Settings → API), then
            restart the dev server.
          </li>
        </ol>
      </div>
    </main>
  );
}
