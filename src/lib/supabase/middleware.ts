import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

/**
 * Refreshes the Supabase auth session on every request and gates protected
 * routes. Unauthenticated users are sent to /login; the /login and /auth routes
 * stay public. If Supabase keys are not configured yet, we let every request
 * through so the app can show its setup screen instead of redirect-looping.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    return supabaseResponse;
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: getUser() must be called to refresh the token. Do not add code
  // between createServerClient and this call.
  //
  // This can hang or fail when the stored refresh token is stale — a session
  // left open overnight, or one rotated out from under this browser. Left
  // unguarded the request stalls, and with a loading skeleton on every route
  // that stall looks exactly like "still loading" forever. Bound it, and
  // treat any failure as simply signed out.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  let sessionBroken = false;
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("auth-timeout")), 5000),
      ),
    ]);
    user = result.data.user;
    if (result.error) sessionBroken = true;
  } catch {
    sessionBroken = true;
  }

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/legal"); // About & Legal pages are public

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirect = NextResponse.redirect(url);
    // A dead session's cookies would fail the same way on every subsequent
    // request, so clear them on the way out. Otherwise the user bounces
    // between a skeleton and the login page with no way to recover but
    // clearing site data by hand.
    if (sessionBroken) {
      for (const c of request.cookies.getAll()) {
        if (c.name.startsWith("sb-") && c.name.includes("-auth-token")) {
          redirect.cookies.delete(c.name);
        }
      }
    }
    return redirect;
  }

  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
