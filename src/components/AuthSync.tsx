"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Keeps every open tab in the same auth state. supabase-js broadcasts auth
 * events across tabs; when another tab signs out we leave the dashboard, and
 * when another tab signs in while this one sits on /login we enter the app.
 * Token auto-refresh runs in the background for long-lived tabs.
 */
export function AuthSync() {
  const router = useRouter();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login");
      } else if (
        event === "SIGNED_IN" &&
        window.location.pathname.startsWith("/login")
      ) {
        router.replace("/");
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
