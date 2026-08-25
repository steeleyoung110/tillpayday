/**
 * Till Payday service worker.
 *
 * The dashboard is live, per-user data — never served stale. The strategy:
 *  - navigations: network first; if the network is gone, show the branded
 *    offline page instead of the browser error.
 *  - hashed static assets (/_next/static) and icons: cache-first, since their
 *    URLs are content-addressed and immutable.
 */
const CACHE = "till-payday-v2";
/** Last-seen HTML per screen, kept apart from immutable assets. */
const PAGES = "till-payday-pages-v1";
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
        Promise.all(
          keys
            .filter((k) => k !== CACHE && k !== PAGES)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Web push: show the notification, and focus/open the app on tap.
self.addEventListener("push", (event) => {
  let data = { title: "Till Payday", body: "", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if (new URL(win.url).origin === self.location.origin) {
          win.navigate(url);
          return win.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    /**
     * Network first, then YOUR last numbers, then the branded offline page.
     *
     * Seeing yesterday's dashboard beats seeing nothing: the figures are
     * still roughly true, and the app tells you they're from cache with an
     * offline badge rather than pretending they're live. Only when we've
     * never cached this screen do we fall back to the offline page.
     *
     * Only same-origin successful HTML is cached, and only for pages the
     * user actually reached — so this never stores something they weren't
     * already looking at.
     */
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(PAGES).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req, { ignoreSearch: true });
          return cached ?? caches.match("/offline.html");
        }),
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
