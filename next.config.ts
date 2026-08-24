import type { NextConfig } from "next";

// Security headers on every response. Deliberately no Content-Security-Policy
// yet — Next's inline runtime needs nonce plumbing to do CSP right, and a
// half-strict CSP is worse than an honest absence. The rest are free wins.
const SECURITY_HEADERS = [
  // Browsers should only ever speak HTTPS to us (2 years, subdomains too).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Never MIME-sniff responses into something executable.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nobody gets to iframe the app (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Don't leak page URLs to third parties beyond the origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // We use none of these — say so explicitly.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  // Pin the workspace root so Next doesn't guess from stray parent lockfiles.
  turbopack: {
    root: __dirname,
  },
  /**
   * NOTE: do not set `experimental.staleTimes.dynamic` here.
   *
   * It looks like the obvious win — every screen is dynamic (per-user, cookie
   * scoped), so caching RSC payloads client-side should make revisiting a tab
   * instant. Measured on 2026-08-23 it does the opposite: with `loading.tsx`
   * present, the prefetched entry for a dynamic route is only the shell down
   * to the loading boundary, and caching that shell means revisits render the
   * skeleton and never resolve to real content. Verified twice: pages hang on
   * the skeleton indefinitely with it on, and settle in ~400ms with it off.
   */
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
