/**
 * Server-side web-push sender. Env-gated like email: without VAPID keys it
 * logs instead of sending and never throws. Dead subscriptions (410/404
 * from the push service) are pruned so the table stays honest.
 */
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PushRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function pushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
}

/** Send one payload to a set of subscriptions; returns delivered count. */
export async function sendPush(
  supabase: SupabaseClient,
  subscriptions: PushRow[],
  payload: { title: string; body: string; url?: string },
): Promise<number> {
  if (!pushConfigured()) {
    console.log(`🔔 [push → console] VAPID keys not set — would send: ${payload.title}`);
    return 0;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:notifications@tillpayday.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  let delivered = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
      );
      delivered += 1;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // The browser revoked this subscription — clean it up.
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.log(
          `🔔 push to ${sub.endpoint.slice(0, 40)}… failed (${status ?? e})`,
        );
      }
    }
  }
  return delivered;
}
