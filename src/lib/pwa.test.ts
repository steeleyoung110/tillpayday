import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

const root = (p: string) =>
  fileURLToPath(new URL(`../../${p}`, import.meta.url));

describe("PWA manifest", () => {
  const m = manifest();

  it("carries the Till Payday identity and brand colors", () => {
    expect(m.name).toBe("Till Payday");
    expect(m.short_name).toBe("Till Payday");
    expect(m.theme_color).toBe("#123F3C"); // deep teal
    expect(m.background_color).toBe("#123F3C");
  });

  it("opens full-screen from the home screen", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
  });

  it("declares 192/512 icons plus a maskable variant — and the files exist", () => {
    const icons = m.icons ?? [];
    expect(icons.map((i) => i.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of icons) {
      expect(existsSync(root(`public${icon.src}`)), `${icon.src} missing`).toBe(true);
    }
  });
});

describe("PWA assets", () => {
  it("ships the service worker, offline page, and apple touch icon", () => {
    expect(existsSync(root("public/sw.js"))).toBe(true);
    expect(existsSync(root("public/offline.html"))).toBe(true);
    expect(existsSync(root("src/app/apple-icon.png"))).toBe(true);
  });
});
