import type { MetadataRoute } from "next";

/**
 * Web app manifest — makes Till Payday installable ("Add to Home Screen")
 * with a full-screen, branded app feel. Served at /manifest.webmanifest and
 * linked automatically by Next.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Till Payday",
    short_name: "Till Payday",
    description:
      "Plan your paychecks, see your safe-to-spend number, and watch your savings grow.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#123F3C",
    theme_color: "#123F3C",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Share TO Till Payday from any app (installed PWA): shared text lands
    // in the Budget quick-spend form, prefilled.
    share_target: {
      action: "/budget",
      method: "GET",
      params: { title: "shared_title", text: "shared_text", url: "shared_url" },
    },
    // Long-press the home-screen icon → jump straight to the habit.
    shortcuts: [
      {
        name: "Log a spend",
        url: "/budget#bills",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Safe to spend today?",
        url: "/",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
