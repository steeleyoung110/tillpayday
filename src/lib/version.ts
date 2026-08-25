/**
 * Which build someone was running when they hit a problem. Vercel exposes the
 * deployed commit; locally there isn't one, and saying "dev" is more honest
 * than inventing a version number.
 */
export const APP_VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
