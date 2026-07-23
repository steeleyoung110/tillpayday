# Till Payday 💵

Plan your paychecks, split them into buckets, and see your savings 12 months into
the future — including "what if I bought this?" previews.

**Stack:** Next.js (App Router) · TypeScript · Tailwind · Supabase (auth + Postgres
with row-level security) · Recharts · Vitest. Deploys to Vercel.

## How it works

- **Net worth** — start by listing what you own (cash, savings, investments,
  property…) and what you owe (cards, loans, mortgage). The app shows your net
  worth, and your liquid assets (cash + savings) become the starting balance of
  the projection, so the chart begins from what you actually have.
- **Income sources** — your paycheck (weekly / every-2-weeks / twice-a-month /
  monthly) plus any side income.
- **Buckets** — named envelopes (Rent, Groceries, Fun money…) that each paycheck
  is split into, by fixed dollars or a percent. One bucket is flagged **savings**
  and automatically receives all leftover, unallocated money. Side income goes
  straight to savings.
- **Planned expenses** — bills with a due date and cadence (one-time, monthly,
  quarterly, yearly) that draw down their bucket.
- **Interest** — each bucket can carry the APY of the real account behind it
  (e.g. 3% for a high-yield savings account vs 0.02% at a big bank). Interest
  accrues daily on positive balances and is credited monthly, the way a real
  savings account statements it.
- **Projection** — a pure TypeScript engine (`src/lib/engine/`) plays all of this
  forward day-by-day over a horizon you pick (1 / 3 / 5 / 10 years) and draws a
  growth line for every bucket plus your total. If any bucket would go negative,
  you get a warning.
- **What-ifs** — add a purchase you're considering and a second dashed line shows
  the impact, with a verdict like "this sets you back 3 weeks." Mark items
  **bought** or **skipped**; skipped items add up to a "saved by saying no" total.

## One-time setup (about 10 minutes)

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), sign up (free), and create a new
   project. Pick any name and a strong database password (save it somewhere).
2. When it finishes provisioning, open **SQL Editor** in the left sidebar.
3. Open `supabase/migrations/0001_init.sql` from this folder, copy its entire
   contents, paste it into the SQL editor, and hit **Run**. This creates the four
   tables with row-level security already enabled — each account can only ever
   see its own data.

### 2. Connect the app

1. In Supabase, go to **Project Settings → API**.
2. Copy `.env.local.example` to a new file named `.env.local`.
3. Paste in the **Project URL** and the **anon public** key.

### 3. Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000, click **Sign up**, and confirm the email Supabase
sends you. Your coworker signs up the same way — separate account, separate data.

> Tip: while testing you can turn off email confirmation in Supabase under
> **Authentication → Providers → Email → Confirm email**.

## Authentication

- **Email + password** and **Google** sign-in, both through Supabase Auth.
- Sessions live in httpOnly cookies, survive browser restarts, auto-refresh in
  the Next.js middleware on every request, and sync across open tabs (sign out
  in one tab signs out all of them). Sessions end only on explicit sign-out.
- The middleware (`src/proxy.ts` → `src/lib/supabase/middleware.ts`) verifies
  the user server-side on every route: logged-out visitors are redirected to
  `/login`, signed-in visitors to `/login` are sent to the dashboard.
- Every table has row-level security; `src/lib/rls.test.ts` signs in as two
  seeded test users (`rls-test-a/b@tillpayday.local`) and proves neither can
  read, update, delete, or forge the other's rows on any table.

### Enabling Google sign-in (one-time)

1. In [Google Cloud Console](https://console.cloud.google.com) create an OAuth
   client ID (type "Web application") and add this authorized redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
2. In the Supabase dashboard: **Authentication → Sign In / Providers → Google**,
   toggle it on and paste the client ID and secret.
3. That's it — the "Continue with Google" button on `/login` already points at
   `/auth/callback`, which exchanges the code for a session cookie.

## Deploying to Vercel

1. Push this folder to a GitHub repository.
2. On [vercel.com](https://vercel.com), click **Add New → Project** and import
   the repo. Vercel auto-detects Next.js.
3. Under **Environment Variables**, add the same two values from `.env.local`:
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy. Then in Supabase under **Authentication → URL Configuration**, set
   the **Site URL** to your Vercel URL so email confirmation links point at the
   deployed app.

## Development

```bash
npm run dev     # start the dev server
npm test        # run the projection-engine test suite (25 tests)
npm run build   # production build + full type-check
```

The projection engine is deliberately pure (no database, no clock, no
randomness) — `src/lib/engine/projection.test.ts` is the best place to see
exactly how the money math behaves.
