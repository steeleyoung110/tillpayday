import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification },
}));

import { pushConfigured, sendPush, type PushRow } from "./push";

const subs: PushRow[] = [
  { id: "s1", endpoint: "https://push.example/1", p256dh: "k1", auth: "a1" },
  { id: "s2", endpoint: "https://push.example/2", p256dh: "k2", auth: "a2" },
];

function mockSupabase() {
  const deleted: string[] = [];
  const supabase = {
    from: () => ({
      delete: () => ({
        eq: (_col: string, id: string) => {
          deleted.push(id);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
  return { supabase: supabase as never, deleted };
}

describe("sendPush", () => {
  beforeEach(() => {
    sendNotification.mockReset();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  it("without VAPID keys it reports unconfigured and sends nothing", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    expect(pushConfigured()).toBe(false);
    const { supabase } = mockSupabase();
    const n = await sendPush(supabase, subs, { title: "t", body: "b" });
    expect(n).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("delivers to every subscription and counts them", async () => {
    sendNotification.mockResolvedValue({});
    const { supabase, deleted } = mockSupabase();
    const n = await sendPush(supabase, subs, { title: "t", body: "b", url: "/" });
    expect(n).toBe(2);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(deleted).toEqual([]);
    // Payload is the JSON the service worker's push handler expects.
    const payload = JSON.parse(sendNotification.mock.calls[0][1] as string);
    expect(payload).toEqual({ title: "t", body: "b", url: "/" });
  });

  it("prunes a subscription the push service says is gone (410)", async () => {
    sendNotification
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockResolvedValueOnce({});
    const { supabase, deleted } = mockSupabase();
    const n = await sendPush(supabase, subs, { title: "t", body: "b" });
    expect(n).toBe(1);
    expect(deleted).toEqual(["s1"]);
  });

  it("a transient failure is logged, not thrown, and doesn't prune", async () => {
    sendNotification.mockRejectedValue({ statusCode: 500 });
    const { supabase, deleted } = mockSupabase();
    const n = await sendPush(supabase, subs, { title: "t", body: "b" });
    expect(n).toBe(0);
    expect(deleted).toEqual([]);
  });
});
