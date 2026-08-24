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
  const warm = useCallback(() => {
    router.prefetch(href);
  }, [router, href]);

  return (
    <Link
      href={href}
      prefetch
      onMouseEnter={warm}
      onTouchStart={warm}
      onFocus={warm}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {children}
    </Link>
  );
}
