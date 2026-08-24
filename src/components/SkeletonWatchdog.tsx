/**
 * A skeleton should be a moment, not a destination.
 *
 * These screens stream: the server sends the skeleton immediately, then the
 * real content, then a small script that swaps one for the other. If that
 * stream is cut — flaky mobile connection, a buffering proxy, a sleeping tab
 * — the swap never runs and the skeleton stays up forever, looking for all
 * the world like the app is still thinking.
 *
 * This deliberately does NOT use React. The failure it guards against is the
 * page failing to hydrate, so a hook-based watchdog would be asleep in
 * exactly the case it exists for. An inline script runs as the HTML parses,
 * before and independent of any of that.
 *
 * One retry only, guarded in sessionStorage: a dropped stream recovers, and
 * a genuinely slow backend degrades into an ordinary wait instead of a
 * reload loop.
 */
export function SkeletonWatchdog({ route }: { route: string }) {
  const key = `tp-skeleton-retry:${route.replace(/[^a-z0-9]/gi, "-")}`;
  const script = [
    "(function(){",
    `var k=${JSON.stringify(key)};`,
    "try{if(sessionStorage.getItem(k))return;}catch(e){return;}",
    "setTimeout(function(){",
    "var t=document.body?document.body.innerText:'';",
    "if(t.indexOf('Loading your')===-1)return;",
    "try{sessionStorage.setItem(k,'1');}catch(e){}",
    "location.reload();",
    "},9000);",
    "})();",
  ].join("");

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
