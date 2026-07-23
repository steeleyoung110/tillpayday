import { describe, expect, it } from "vitest";
import {
  COOLING_OFF_MS,
  coolingState,
  formatRemaining,
} from "./coolingOff";

const T0 = Date.UTC(2026, 6, 22, 12, 0, 0); // 2026-07-22T12:00:00Z
const iso = (ms: number) => new Date(ms).toISOString();

describe("coolingState", () => {
  it("is 'none' when no timer has been started", () => {
    expect(coolingState(null, T0).phase).toBe("none");
  });

  it("is 'cooling' with the right remaining time mid-timer", () => {
    const started = iso(T0 - 46 * 60 * 60 * 1000); // 46h ago
    const s = coolingState(started, T0);
    expect(s.phase).toBe("cooling");
    expect(s.remainingMs).toBe(2 * 60 * 60 * 1000); // 2h left
    expect(s.endsAtMs).toBe(T0 + 2 * 60 * 60 * 1000);
  });

  it("is 'ready' exactly at the 48h mark, not a moment before", () => {
    const started = iso(T0 - COOLING_OFF_MS);
    expect(coolingState(started, T0).phase).toBe("ready");
    expect(coolingState(started, T0 - 1).phase).toBe("cooling");
    expect(coolingState(started, T0 - 1).remainingMs).toBe(1);
  });

  it("stays 'ready' long after expiry", () => {
    const started = iso(T0 - 10 * COOLING_OFF_MS);
    const s = coolingState(started, T0);
    expect(s.phase).toBe("ready");
    expect(s.remainingMs).toBe(0);
  });
});

describe("formatRemaining", () => {
  it("formats hours and minutes", () => {
    expect(formatRemaining(47 * 60 * 60 * 1000 + 59 * 60 * 1000)).toBe("47h 59m");
    expect(formatRemaining(3 * 60 * 60 * 1000)).toBe("3h 0m");
    expect(formatRemaining(42 * 60 * 1000)).toBe("42m");
    expect(formatRemaining(30_000)).toBe("1m"); // rounds up, never understates
    expect(formatRemaining(0)).toBe("under a minute");
  });

  it("rounds partial minutes up so it never shows less time than remains", () => {
    expect(formatRemaining(60_001)).toBe("2m");
  });
});
