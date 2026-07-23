"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (production only — caching would fight the dev
 * server's hot reload). Registration is best-effort: if it fails the app is
 * simply a normal website.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // No SW support or registration blocked — fine, nothing degrades.
    });
  }, []);

  return null;
}
