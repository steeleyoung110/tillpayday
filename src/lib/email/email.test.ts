import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPaydayRecapEmail } from "./paydayRecap";
import { sendEmail } from "./send";

const recap = { payday: "2026-07-24", swept: 147, savingsTotal: 3125 };

describe("buildPaydayRecapEmail", () => {
  it("mirrors the celebration screen content", () => {
    const msg = buildPaydayRecapEmail("s@example.com", "Steele", recap, 10000);
    expect(msg.to).toBe("s@example.com");
    expect(msg.subject).toBe("🎉 Payday! You banked $147");
    for (const body of [msg.text, msg.html]) {
      expect(body).toContain("You didn't spend $147 last cycle");
      expect(body).toContain("$3,125");
      expect(body).toContain("31% of your $10,000 savings goal");
      expect(body).toContain("Friday, July 24");
    }
    expect(msg.text).toContain("Hi Steele");
  });

  it("adapts when nothing was swept and when there is no goal", () => {
    const msg = buildPaydayRecapEmail(
      "s@example.com",
      "Steele",
      { ...recap, swept: 0 },
      0,
    );
    expect(msg.subject).toBe("🎉 Payday! Your buckets are refilled");
    expect(msg.text).toContain("Right on budget last cycle");
    expect(msg.text).not.toContain("savings goal");
  });

  it("describes an overspent cycle honestly", () => {
    const msg = buildPaydayRecapEmail(
      "s@example.com",
      "Steele",
      { ...recap, swept: -60 },
      0,
    );
    expect(msg.text).toContain("ran $60 over — savings covered it");
  });
});

describe("sendEmail", () => {
  const msg = buildPaydayRecapEmail("s@example.com", "Steele", recap, 0);

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("logs to the console (and does not throw) when RESEND_API_KEY is unset", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendEmail(msg);
    expect(result.delivered).toBe("console");
    expect(fetchSpy).not.toHaveBeenCalled();
    const logged = log.mock.calls[0][0] as string;
    expect(logged).toContain("To: s@example.com");
    expect(logged).toContain(msg.subject);
  });

  it("POSTs to Resend with the API key when configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email_abc" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendEmail(msg);
    expect(result).toEqual({ delivered: "resend", id: "email_abc" });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_test_123",
    );
    const body = JSON.parse(String(init.body));
    expect(body.to).toEqual(["s@example.com"]);
    expect(body.subject).toBe(msg.subject);
  });

  it("falls back to console on an API error instead of throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 401 })),
    );

    const result = await sendEmail(msg);
    expect(result.delivered).toBe("console");
    expect(result.error).toBe("nope");
    expect(log).toHaveBeenCalled();
  });

  it("falls back to console on a network failure instead of throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const result = await sendEmail(msg);
    expect(result.delivered).toBe("console");
    expect(result.error).toBe("ECONNREFUSED");
    expect(log).toHaveBeenCalled();
  });
});
