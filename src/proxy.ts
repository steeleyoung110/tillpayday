import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all paths except static assets, images, the PWA files
     * (manifest, service worker, offline page) — browsers fetch those without
     * auth cookies, and installability breaks if they redirect to /login —
     * and /api/nudges, which Vercel Cron calls with a bearer secret instead
     * of a session (the route does its own auth).
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|pdf.worker.min.mjs|offline.html|icons/|apple-icon.png|api/nudges|api/calendar|demo|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
