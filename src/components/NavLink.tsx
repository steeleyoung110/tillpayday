"use client";

/**
 * Nav link with intent prefetching. Next already prefetches links in the
 * viewport, and with a `loading.tsx` on every route that prefetch covers the
 * layout down to the loading boundary — so the skeleton is already in the
 * browser when you click and the tab switch has no blank gap.
 *
 * This adds the second half: on hover (desktop) or the moment a finger
 * touches down (mobile), warm the route again so the real content is on its
 * way before the tap even completes.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

export function NavLink({
  href,
  active,
  className,
  children,
}: {
  href: string;
  active: boolean;
  className: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  /**
   * Hover only — deliberately NOT touch or focus as well.
   *
   * Every prefetch of a dynamic route is a real server request that
   * re-validates the session. Firing on three separate triggers across five
   * nav links produced a burst of concurrent requests all refreshing the
   * same auth token, which is a good way to wedge a session. One trigger,
   * on clear intent, plus Next's own viewport prefetching, is plenty.
   */
  const warm = useCallback(() => {
    router.prefetch(href);
  }, [router, href]);

  return (
    <Link
      href={href}
      prefetch
      onMouseEnter={warm}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {children}
    </Link>
  );
}
