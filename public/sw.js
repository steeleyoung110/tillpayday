/**
 * Till Payday service worker.
 *
 * The dashboard is live, per-user data — never served stale. The strategy:
 *  - navigations: network first; if the network is gone, show the branded
 *    offline page instead of the browser error.
 *  - hashed static assets (/_next/static) and icons: cache-first, since their
 *    URLs are content-addressed and immutable.
 */
const CACHE = "till-payday-v1";
const PRECACHE = ["/offline.html", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/offline.html")),
    );
    return;
  }

  const immutable =
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/"));
  if (immutable) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
