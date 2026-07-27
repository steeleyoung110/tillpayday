# Till Payday — production setup checklist

Everything the app's code is already wired for, but that needs an account
owner (you, Steele) to configure. Each item is independent; the app degrades
gracefully without it.

## 1. Recap + nudge emails (Resend)

- Create a free account at https://resend.com → API Keys → create key.
- Vercel → tillpayday → Settings → Environment Variables → add
  `RESEND_API_KEY` (Production). Optionally `RESEND_FROM` once you verify a
  domain; until then the shared `onboarding@resend.dev` sender is used.
- Without the key, every email is logged to the server console instead —
  nothing breaks, nothing sends.

## 2. Daily nudge cron

- The cron schedule is already in `vercel.json` (daily 13:00 UTC → /api/nudges).
- Vercel → Settings → Environment Variables → add:
  - `CRON_SECRET` — any long random string; Vercel automatically sends it as
    the Authorization header on cron invocations.
  - `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → Project Settings →
    API keys. **Server-side secret. Never expose it to the browser or commit
    it.**
- Until both are set, /api/nudges answers 503 "unconfigured" and does nothing.

## 3. Google sign-in

- Google Cloud Console → create OAuth 2.0 Client ID (web application).
  - Authorized redirect URI: `https://wjmqerdbojuudlxggtwm.supabase.co/auth/v1/callback`
- Supabase dashboard → Authentication → Providers → Google → paste client ID
  + secret, enable.
- The legal acknowledgment is already handled: OAuth signups get routed
  through `/legal-accept` exactly once (email signups tick the box at sign-up).

## 4. Legal contact email

- `src/app/legal/page.tsx` still contains the literal “[contact email]”
  placeholder. Replace it with a real address (e.g. a dedicated
  tillpayday@… inbox) before sharing the app beyond coworkers.

## 5. Supabase auth hardening

- Supabase dashboard → Authentication → Settings:
  - Enable **leaked password protection** (checks candidates against
    HaveIBeenPwned).
  - Consider lowering OTP/session lifetimes to taste.

## 6. Nice-to-haves already wired

- CSV export: `/api/export?table=…` (Settings page has download chips).
- CSV import: Settings → Your data → Import spending from a CSV.
- PWA install: Settings → “Put it on your phone.”
