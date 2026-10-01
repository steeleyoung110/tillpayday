import type { MetadataRoute } from "next";

/**
 * Web app manifest — makes Property Log installable ("Add to Home Screen")
 * with a full-screen, branded app feel. Served at /manifest.webmanifest and
 * linked automatically by Next.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Property Log",
    short_name: "Property Log",
    description:
      "Your properties, rents, and expenses — one at a time or all together, with honest yearly numbers.",
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
    // Long-press the home-screen icon → straight to the portfolio or the list.
    shortcuts: [
      {
        name: "Portfolio",
        url: "/",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Properties",
        url: "/properties",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
