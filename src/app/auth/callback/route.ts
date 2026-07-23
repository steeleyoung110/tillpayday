import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth (PKCE) callback: Google sends the user back here with a one-time code,
 * which we exchange server-side for a session cookie before landing on the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Google sign-in failed — try again.")}`,
  );
}
