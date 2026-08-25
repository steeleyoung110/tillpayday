"use client";

/**
 * Carries the screen someone was on into their feedback. "The chart looks
 * wrong" is a mystery; the same words plus "/budget" is a bug report.
 *
 * The path only — never query strings, which on this app can carry a shared
 * spend's text or an owner id.
 */
import { usePathname } from "next/navigation";

export function RouteField() {
  const pathname = usePathname();
  return <input type="hidden" name="route" value={pathname ?? ""} />;
}
