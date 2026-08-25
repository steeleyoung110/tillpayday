/**
 * Which first-run tips a person has already dismissed. Plain module, not a
 * client one, so the server components that render each tab can ask before
 * they render anything.
 */

/** Read the dismissed list off the auth user's metadata. */
export function coachSeen(meta: Record<string, unknown>, key: string): boolean {
  return (
    Array.isArray(meta.coach_seen) &&
    (meta.coach_seen as string[]).includes(key)
  );
}

/**
 * The single tip per tab. One each — the thing that screen exists for, in the
 * app's own voice. Anything more belongs in the guide.
 */
export const COACH_MARKS: Record<string, { title: string; body: string }> = {
  dashboard: {
    title: "This number is the whole app 👋",
    body:
      "Safe-to-spend is what's left in your flexible buckets divided by the days until payday. Spend less than it today and tomorrow's number goes up. Tap “why did my number change?” any time you want the receipt.",
  },
  budget: {
    title: "This is where you change things 🪣",
    body:
      "Buckets decide how each paycheck splits; bills come out of them. Everything on the Dashboard is a consequence of what's on this page — so if a number looks wrong, the fix is here.",
  },
  networth: {
    title: "The long view 📊",
    body:
      "What you own minus what you owe. Add a debt with its rate and payment and the app will tell you the real payoff date — including when a payment doesn't cover the interest.",
  },
  grow: {
    title: "Play with the numbers 🌱",
    body:
      "Nothing here touches your budget — these are calculators. Drag an extra payment up and watch years fall off a loan, or see what a raise actually does once it's split.",
  },
  updates: {
    title: "This is a two-way street 📣",
    body:
      "App news lands here, and so does anything you send me. If something is broken or confusing, say so bluntly — you'll get a reply on this page.",
  },
};
